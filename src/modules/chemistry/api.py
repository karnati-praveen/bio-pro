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
