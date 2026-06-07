"""Core chemistry operations.

Property calculation is PubChem-backed (accurate XLogP/TPSA/HBD/HBA/Lipinski) with a
pure-Python formula/molecular-weight fallback when the network is unavailable. Also
provides MS isotope patterns, reaction-SMILES assembly, and reaction-kinetics ODEs.
No RDKit dependency.
"""

from __future__ import annotations

import re
from typing import Optional

import numpy as np
from scipy.integrate import solve_ivp

# --------------------------------------------------------------------------- #
# Atomic data (average + monoisotopic masses, common isotope abundances)
# --------------------------------------------------------------------------- #
AVG_MASS = {
    "H": 1.008, "C": 12.011, "N": 14.007, "O": 15.999, "S": 32.06, "P": 30.974,
    "F": 18.998, "Cl": 35.45, "Br": 79.904, "I": 126.904, "Na": 22.990,
    "K": 39.098, "B": 10.81, "Si": 28.085,
}
MONO_MASS = {
    "H": 1.007825, "C": 12.0, "N": 14.003074, "O": 15.994915, "S": 31.972071,
    "P": 30.973762, "F": 18.998403, "Cl": 34.968853, "Br": 78.918338,
    "I": 126.904473, "Na": 22.989770, "K": 38.963707, "B": 11.009305, "Si": 27.976927,
}
# Default valence for implicit-H estimation in the SMILES fallback.
DEFAULT_VALENCE = {"C": 4, "N": 3, "O": 2, "S": 2, "P": 3, "F": 1, "Cl": 1, "Br": 1, "I": 1, "B": 3}
ORGANIC_SUBSET = {"B", "C", "N", "O", "S", "P", "F", "Cl", "Br", "I"}


# --------------------------------------------------------------------------- #
# Molecular formula
# --------------------------------------------------------------------------- #
def parse_formula(formula: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for el, num in re.findall(r"([A-Z][a-z]?)(\d*)", formula or ""):
        if not el:
            continue
        counts[el] = counts.get(el, 0) + (int(num) if num else 1)
    return counts


def mass_from_formula(formula: str, monoisotopic: bool = False) -> float:
    table = MONO_MASS if monoisotopic else AVG_MASS
    total = 0.0
    for el, n in parse_formula(formula).items():
        total += table.get(el, 0.0) * n
    return round(total, 4)


_BOND_ORDER = {"-": 1.0, "=": 2.0, "#": 3.0, ":": 1.5, "/": 1.0, "\\": 1.0}


def formula_from_smiles(smiles: str) -> Optional[str]:
    """Formula from SMILES via a single-pass bond-counting parser with implicit H.

    Handles branches, ring closures, double/triple/aromatic bonds, and bracket atoms.
    A dependency-free fallback for when PubChem is unreachable.
    """
    s = smiles or ""
    atoms: list[dict] = []          # {el, arom, bonds, explicit_h, bracket}
    extra_h = 0                     # H from bracket atoms
    counts_other: dict[str, int] = {}
    stack: list[int] = []
    ring_open: dict[str, tuple[int, float, bool]] = {}
    prev: Optional[int] = None
    pending = 1.0
    pending_explicit = False
    i = 0

    def add_atom(el: str, arom: bool, explicit_h: int | None, bracket: bool) -> int:
        atoms.append({"el": el, "arom": arom, "bonds": 0.0,
                      "explicit_h": explicit_h, "bracket": bracket})
        return len(atoms) - 1

    def connect(a: int, b: int) -> None:
        # Default (no symbol) bond between two aromatic atoms is 1.5; otherwise 1.0.
        if pending_explicit:
            bo = pending
        elif atoms[a]["arom"] and atoms[b]["arom"]:
            bo = 1.5
        else:
            bo = 1.0
        atoms[a]["bonds"] += bo
        atoms[b]["bonds"] += bo

    while i < len(s):
        c = s[i]
        if c == "[":
            j = s.index("]", i)
            inner = s[i + 1:j]
            m = re.match(r"\d*([A-Z][a-z]?|[bcnops])(.*)", inner)
            if m:
                el = m.group(1).upper() if len(m.group(1)) == 1 else m.group(1)
                arom = m.group(1).islower()
                h = re.search(r"H(\d*)", m.group(2))
                eh = (int(h.group(1)) if h.group(1) else 1) if h else 0
                idx = add_atom(el, arom, eh, True)
                if prev is not None:
                    connect(prev, idx)
                pending, pending_explicit = 1.0, False
                prev = idx
            i = j + 1
            continue
        if c in _BOND_ORDER:
            pending, pending_explicit = _BOND_ORDER[c], True
            i += 1
            continue
        if c == "(":
            stack.append(prev)
            i += 1
            continue
        if c == ")":
            prev = stack.pop() if stack else prev
            i += 1
            continue
        if c.isdigit() or c == "%":
            if c == "%":
                key = s[i + 1:i + 3]; i += 3
            else:
                key = c; i += 1
            if prev is None:
                continue
            if key in ring_open:
                a, order, expl = ring_open.pop(key)
                if expl or pending_explicit:
                    bo = max(order, pending)
                elif atoms[a]["arom"] and atoms[prev]["arom"]:
                    bo = 1.5
                else:
                    bo = 1.0
                atoms[a]["bonds"] += bo
                atoms[prev]["bonds"] += bo
            else:
                ring_open[key] = (prev, pending, pending_explicit)
            pending, pending_explicit = 1.0, False
            continue
        # organic-subset atom
        m = re.match(r"Cl|Br|[BCNOSPFIbcnops]", s[i:])
        if m:
            tok = m.group(0)
            el = tok.upper() if len(tok) == 1 else tok
            arom = tok.islower()
            idx = add_atom(el, arom, None, False)
            if prev is not None:
                connect(prev, idx)
            pending, pending_explicit = 1.0, False
            prev = idx
            i += len(tok)
            continue
        i += 1  # skip anything else (charges already consumed inside brackets)

    if not atoms:
        return None

    counts: dict[str, int] = {}
    h_total = 0
    for a in atoms:
        counts[a["el"]] = counts.get(a["el"], 0) + 1
        if a["bracket"]:
            h_total += a["explicit_h"] or 0
            continue
        val = DEFAULT_VALENCE.get(a["el"])
        if val:
            h_total += max(0, round(val - a["bonds"]))
    if h_total:
        counts["H"] = counts.get("H", 0) + h_total

    order = sorted(counts, key=lambda e: (e != "C", e != "H", e))
    return "".join(f"{e}{counts[e] if counts[e] > 1 else ''}" for e in order)


# --------------------------------------------------------------------------- #
# Lipinski rule of five
# --------------------------------------------------------------------------- #
def lipinski(mw: float, logp: float, hbd: int, hba: int) -> dict:
    checks = {
        "mw_le_500": (mw is not None and mw <= 500),
        "logp_le_5": (logp is not None and logp <= 5),
        "hbd_le_5": (hbd is not None and hbd <= 5),
        "hba_le_10": (hba is not None and hba <= 10),
    }
    violations = sum(1 for ok in checks.values() if ok is False)
    return {"checks": checks, "violations": violations, "passes": violations <= 1}


# --------------------------------------------------------------------------- #
# PubChem REST client (network; cached by caller)
# --------------------------------------------------------------------------- #
PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
_PROPS = ("MolecularFormula", "MolecularWeight", "ExactMass", "XLogP", "TPSA",
          "HBondDonorCount", "HBondAcceptorCount", "RotatableBondCount",
          "CanonicalSMILES", "IsomericSMILES", "InChI", "InChIKey", "IUPACName")


def _namespace(input_type: str, query: str) -> str:
    import urllib.parse
    q = urllib.parse.quote(query, safe="")
    return {"name": f"name/{q}", "smiles": f"smiles/{q}", "cid": f"cid/{q}"}.get(input_type, f"name/{q}")


def pubchem_properties(query: str, input_type: str = "name", timeout: float = 8.0) -> dict:
    """Fetch identity + computed descriptors from PubChem. Raises on network/lookup failure."""
    import httpx

    ns = _namespace(input_type, query)
    url = f"{PUBCHEM}/compound/{ns}/property/{','.join(_PROPS)}/JSON"
    with httpx.Client(timeout=timeout) as client:
        resp = client.get(url)
        resp.raise_for_status()
        props = resp.json()["PropertyTable"]["Properties"][0]

    cid = props.get("CID")
    mw = _to_float(props.get("MolecularWeight"))
    logp = _to_float(props.get("XLogP"))
    hbd = props.get("HBondDonorCount")
    hba = props.get("HBondAcceptorCount")
    return {
        "cid": cid,
        "name": props.get("IUPACName") or query,
        "formula": props.get("MolecularFormula"),
        "mw": mw,
        "exact_mass": _to_float(props.get("ExactMass")),
        "logp": logp,
        "tpsa": _to_float(props.get("TPSA")),
        "hbd": hbd,
        "hba": hba,
        "rotatable_bonds": props.get("RotatableBondCount"),
        "smiles": props.get("IsomericSMILES") or props.get("CanonicalSMILES"),
        "inchi": props.get("InChI"),
        "inchikey": props.get("InChIKey"),
        "image_url": f"{PUBCHEM}/compound/cid/{cid}/PNG" if cid else None,
        "lipinski": lipinski(mw, logp, hbd, hba),
        "source": "pubchem",
    }


def offline_properties(smiles: str) -> dict:
    """Network-free fallback: formula + masses from the SMILES string only."""
    formula = formula_from_smiles(smiles)
    return {
        "cid": None, "name": smiles, "formula": formula,
        "mw": mass_from_formula(formula) if formula else None,
        "exact_mass": mass_from_formula(formula, monoisotopic=True) if formula else None,
        "logp": None, "tpsa": None, "hbd": None, "hba": None, "rotatable_bonds": None,
        "smiles": smiles, "inchi": None, "inchikey": None, "image_url": None,
        "lipinski": None,
        "source": "offline",
        "note": "Offline estimate — connect to PubChem for LogP/TPSA/H-bond counts.",
    }


def pubchem_sdf(query: str, input_type: str = "smiles", dim: str = "3d", timeout: float = 10.0) -> Optional[str]:
    import httpx
    ns = _namespace(input_type, query)
    url = f"{PUBCHEM}/compound/{ns}/record/SDF"
    params = {"record_type": "3d"} if dim == "3d" else {}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.text
    except Exception:
        return None


def _to_float(v) -> Optional[float]:
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# MS isotope pattern (approximate: M, M+1, M+2 from element counts)
# --------------------------------------------------------------------------- #
def isotope_pattern(formula: str) -> list[dict]:
    counts = parse_formula(formula)
    base = mass_from_formula(formula, monoisotopic=True)
    nC, nH, nN, nO, nS = (counts.get(e, 0) for e in ("C", "H", "N", "O", "S"))
    nCl, nBr = counts.get("Cl", 0), counts.get("Br", 0)

    # M+1 relative intensity (%) — dominated by 13C (1.1% each), plus 15N, 2H, 33S.
    m1 = nC * 1.07 + nN * 0.37 + nH * 0.015 + nS * 0.76
    # M+2 — 18O, 34S, and the big ones: 37Cl (32%) and 81Br (97%).
    m2 = nO * 0.20 + nS * 4.29 + nCl * 32.0 + nBr * 97.3 + (nC * (nC - 1) / 2) * (0.011 ** 2) * 100
    peaks = [{"mz": round(base, 4), "intensity": 100.0, "label": "M"}]
    if m1 > 0.5:
        peaks.append({"mz": round(base + 1.0034, 4), "intensity": round(min(m1, 100), 2), "label": "M+1"})
    if m2 > 0.5:
        peaks.append({"mz": round(base + 1.9966, 4), "intensity": round(min(m2, 100), 2), "label": "M+2"})
    return peaks


# --------------------------------------------------------------------------- #
# Reaction SMILES
# --------------------------------------------------------------------------- #
def reaction_smiles(reactants: list[str], products: list[str], reagents: list[str] | None = None) -> str:
    r = ".".join(s for s in reactants if s)
    a = ".".join(s for s in (reagents or []) if s)
    p = ".".join(s for s in products if s)
    return f"{r}>{a}>{p}"


# --------------------------------------------------------------------------- #
# Reaction-kinetics ODE (mass-action + Michaelis–Menten)
# --------------------------------------------------------------------------- #
def kinetics(reactions: list[dict], species: dict[str, float], t_end: float = 100.0,
             n_points: int = 200) -> dict:
    """Integrate a small reaction network.

    reactions: [{reactants:[ids], products:[ids], k: float, reversible?, k_rev?,
                 type?: "mass_action"|"mm", km?, vmax?, enzyme?, substrate?, product?}]
    species:   {id: initial_concentration}
    """
    names = list(species.keys())
    idx = {n: i for i, n in enumerate(names)}
    y0 = [float(species[n]) for n in names]

    def rhs(t, y):
        dy = [0.0] * len(names)
        for rxn in reactions:
            if rxn.get("type") == "mm":
                s = rxn["substrate"]; p = rxn["product"]
                vmax = rxn.get("vmax", 1.0); km = rxn.get("km", 1.0)
                S = max(y[idx[s]], 0.0)
                v = vmax * S / (km + S)
                dy[idx[s]] -= v
                dy[idx[p]] += v
                continue
            k = rxn.get("k", 1.0)
            rate = k
            for r in rxn["reactants"]:
                rate *= max(y[idx[r]], 0.0)
            for r in rxn["reactants"]:
                dy[idx[r]] -= rate
            for p in rxn["products"]:
                dy[idx[p]] += rate
            if rxn.get("reversible"):
                k_rev = rxn.get("k_rev", 0.0)
                rate_r = k_rev
                for p in rxn["products"]:
                    rate_r *= max(y[idx[p]], 0.0)
                for p in rxn["products"]:
                    dy[idx[p]] -= rate_r
                for r in rxn["reactants"]:
                    dy[idx[r]] += rate_r
        return dy

    t_eval = np.linspace(0.0, t_end, n_points)
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="LSODA", rtol=1e-6, atol=1e-9)
    series = [{"name": n, "values": [round(float(v), 5) for v in sol.y[i]]} for i, n in enumerate(names)]
    return {"t": [round(float(t), 3) for t in t_eval], "series": series}
