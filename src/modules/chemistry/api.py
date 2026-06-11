"""Module 6 — Chemistry backend.

PubChem-backed molecular properties (cached), MS isotope patterns, reaction SMILES,
3D SDF retrieval, and reaction-kinetics ODE simulation.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from modules import chemistry as chem
from shared.db import repo

router = APIRouter(prefix="/api/chem", tags=["chemistry"])


class PropsRequest(BaseModel):
    query: str
    input_type: str = "name"   # name | smiles | cid


@router.post("/properties")
def properties(req: PropsRequest) -> dict:
    """Identity + computed descriptors (PubChem, cached). Falls back to offline estimate."""
    key = f"{req.input_type}:{req.query}".lower()
    cached = repo.get_chem_cache(key)
    if cached:
        return cached
    try:
        data = chem.pubchem_properties(req.query, req.input_type)
        repo.put_chem_cache(key, data, cid=data.get("cid"))
        return data
    except Exception:
        # Offline fallback works only when a SMILES was supplied.
        if req.input_type == "smiles":
            return chem.offline_properties(req.query)
        raise HTTPException(status_code=502,
                            detail="PubChem unreachable and no SMILES given for offline estimate.")


@router.get("/pubchem/{name}")
def pubchem_lookup(name: str) -> dict:
    """Search PubChem by compound name → identity + properties (cached)."""
    key = f"name:{name}".lower()
    cached = repo.get_chem_cache(key)
    if cached:
        return cached
    try:
        data = chem.pubchem_properties(name, "name")
        repo.put_chem_cache(key, data, cid=data.get("cid"))
        return data
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"'{name}' not found on PubChem ({exc}).")


class SdfRequest(BaseModel):
    query: str
    input_type: str = "smiles"
    dim: str = "3d"


@router.post("/sdf")
def sdf(req: SdfRequest) -> Response:
    text = chem.pubchem_sdf(req.query, req.input_type, req.dim)
    if not text:
        raise HTTPException(status_code=404, detail="No 3D structure available for this input.")
    return Response(content=text, media_type="chemical/x-mdl-sdfile")


class FormulaRequest(BaseModel):
    formula: str


@router.post("/ms-isotopes")
def ms_isotopes(req: FormulaRequest) -> dict:
    return {"formula": req.formula, "peaks": chem.isotope_pattern(req.formula)}


class ReactionRequest(BaseModel):
    reactants: list[str]
    products: list[str]
    reagents: Optional[list[str]] = None


@router.post("/reaction-smiles")
def reaction(req: ReactionRequest) -> dict:
    return {"reaction_smiles": chem.reaction_smiles(req.reactants, req.products, req.reagents)}


class BalanceRequest(BaseModel):
    reactants: list[str]
    products: list[str]


@router.post("/balance")
def balance(req: BalanceRequest) -> dict:
    """Balance an equation → smallest integer coefficients + formatted equation."""
    try:
        return chem.balance_reaction(req.reactants, req.products)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class Amount(BaseModel):
    grams: Optional[float] = None
    moles: Optional[float] = None


class StoichiometryRequest(BaseModel):
    reactants: list[str]
    products: list[str]
    amounts: dict[str, Amount]                 # reactant formula → amount
    actual: Optional[dict[str, Amount]] = None  # product formula → measured yield


@router.post("/stoichiometry")
def stoichiometry(req: StoichiometryRequest) -> dict:
    """Balance, then compute limiting reagent, theoretical yields, and percent yield."""
    try:
        balanced = chem.balance_reaction(req.reactants, req.products)
        amounts = {k: v.model_dump(exclude_none=True) for k, v in req.amounts.items()}
        actual = ({k: v.model_dump(exclude_none=True) for k, v in req.actual.items()}
                  if req.actual else None)
        result = chem.stoichiometry(balanced, amounts, actual)
        return {"balanced": balanced, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class KineticsRequest(BaseModel):
    reactions: list[dict]
    species: dict[str, float]
    t_end: float = 100.0


@router.post("/kinetics")
def kinetics(req: KineticsRequest) -> dict:
    try:
        return chem.kinetics(req.reactions, req.species, req.t_end)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Acid–base chemistry (pH, buffers, titration)
# --------------------------------------------------------------------------- #
@router.get("/pka-table")
def pka_table() -> dict:
    """Reference pKa/pKb values for common acids, bases, and lab buffers."""
    return {"table": chem.PKA_TABLE}


class StrongPhRequest(BaseModel):
    conc: float
    kind: str = "acid"          # acid | base


@router.post("/ph/strong")
def ph_strong(req: StrongPhRequest) -> dict:
    """pH of a strong monoprotic acid or base (water-autoionization aware)."""
    try:
        return {"ph": chem.ph_strong(req.conc, req.kind)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class WeakPhRequest(BaseModel):
    conc: float
    ka: Optional[float] = None
    pka: Optional[float] = None
    kind: str = "acid"          # acid | base (ka is Kb for a base)


@router.post("/ph/weak")
def ph_weak(req: WeakPhRequest) -> dict:
    """pH of a weak monoprotic acid (or base, when ``ka``/``pka`` is its Kb/pKb)."""
    ka = req.ka if req.ka is not None else (10.0 ** (-req.pka) if req.pka is not None else None)
    if ka is None:
        raise HTTPException(status_code=400, detail="Provide ka or pka.")
    try:
        return {"ph": chem.ph_weak(req.conc, ka, req.kind)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class BufferRequest(BaseModel):
    acid: float
    base: float
    pka: float


@router.post("/buffer")
def buffer(req: BufferRequest) -> dict:
    """Henderson–Hasselbalch buffer pH from a conjugate acid/base pair + pKa."""
    try:
        return {"ph": chem.buffer_ph(req.acid, req.base, req.pka)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TitrationRequest(BaseModel):
    analyte: dict               # {conc, volume(mL), kind, optional ka/pka/kb/pkb}
    titrant: dict               # {conc, kind}
    ka: Optional[float] = None


@router.post("/titration")
def titration(req: TitrationRequest) -> dict:
    """Titration curve (pH vs volume) with equivalence, half-equivalence, and
    buffer-region annotations."""
    try:
        return chem.titration_curve(req.analyte, req.titrant, req.ka)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
