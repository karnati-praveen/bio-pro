"""Core chemistry operations.

Property calculation is PubChem-backed (accurate XLogP/TPSA/HBD/HBA/Lipinski) with a
pure-Python formula/molecular-weight fallback when the network is unavailable. Also
provides MS isotope patterns, reaction-SMILES assembly, and reaction-kinetics ODEs.
No RDKit dependency.
"""

from __future__ import annotations

import math
import re
from fractions import Fraction
from functools import reduce
from math import gcd, lcm
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

# Bracket-atom grammar: optional isotope, element (lowercase => aromatic), explicit
# H count, then charge.  Trailing stereo/atom-map tokens are ignored.  Hydrogens on a
# bracket atom are ALWAYS explicit; charge never adds or removes them.
_BRACKET_RE = re.compile(
    r"^(?P<iso>\d+)?(?P<el>[A-Z][a-z]?|[bcnops])(?P<h>H\d*)?"
    r"(?P<charge>[+-]\d+|[+-]+)?"
)


def formula_from_smiles(smiles: str) -> Optional[str]:
    """Molecular formula from a SMILES string via a bond-counting parser.

    A dependency-free fallback for when PubChem is unreachable.  It tracks the bond
    order incident on every atom (single/double/triple/aromatic, branches, and ring
    closures), then derives implicit hydrogens for organic-subset atoms from
    ``DEFAULT_VALENCE``.  Aromaticity is handled two ways that agree on the formula:

    * **Kekulé** rings (e.g. benzene ``C1=CC=CC=C1``) are counted from their explicit
      alternating single/double bonds.
    * **Lowercase aromatic** atoms (e.g. ``c1ccccc1``) contribute 1.5 per aromatic
      bond, so a ring carbon sums to 3.0 and keeps one implicit H — the same result.

    Bracket atoms (``[...]``) take hydrogens only from an explicit ``Hn``; their charge
    is parsed but does not change the H count (so ``[NH4+]`` is N+4H and ``[O-]`` is O+0H).
    Ring-closure bonds resolve consistently whether the bond symbol is written at the
    opening or the closing digit (``C=1...C1`` ≡ ``C1...C=1``).

    Known limitations (use PubChem for exact results):
    * No real valence model — radicals, hypervalent S/P/N, and unusual oxidation states
      are estimated from a single default valence per element and may be off by an H.
    * Aromatic perception is purely syntactic: a lowercase ring that does not close, or
      an aromatic N that needs an H, must be written explicitly (``[nH]``); fused/odd
      aromatic systems can mis-round implicit H by one.
    * Stereochemistry, isotopes, atom maps, and reaction/dot-separated components beyond
      a single molecule are ignored for the formula.
    * Bracket atoms that omit ``Hn`` are taken to have zero H, per SMILES semantics.
    """
    s = smiles or ""
    atoms: list[dict] = []          # {el, arom, bonds, explicit_h, bracket}
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

    def resolve_order(a: int, b: int, order: float, explicit: bool) -> float:
        # An explicitly written symbol wins; otherwise two aromatic atoms default to
        # an aromatic bond (1.5) and everything else to a single bond.
        if explicit:
            return order
        if atoms[a]["arom"] and atoms[b]["arom"]:
            return 1.5
        return 1.0

    def connect(a: int, b: int, order: float, explicit: bool) -> None:
        bo = resolve_order(a, b, order, explicit)
        atoms[a]["bonds"] += bo
        atoms[b]["bonds"] += bo

    while i < len(s):
        c = s[i]
        if c == "[":
            j = s.index("]", i)
            m = _BRACKET_RE.match(s[i + 1:j])
            if m:
                raw = m.group("el")
                el = raw.upper() if len(raw) == 1 else raw
                arom = raw.islower()
                h = m.group("h")
                eh = (int(h[1:]) if len(h) > 1 else 1) if h else 0
                idx = add_atom(el, arom, eh, True)
                if prev is not None:
                    connect(prev, idx, pending, pending_explicit)
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
                a, open_order, open_expl = ring_open.pop(key)
                # The bond order may be written at either end; prefer whichever end is
                # explicit (the stronger, if — invalidly — both are) for a consistent
                # result, else fall back to the aromatic-aware default.
                if open_expl or pending_explicit:
                    bo = max(open_order if open_expl else 1.0,
                             pending if pending_explicit else 1.0)
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
                connect(prev, idx, pending, pending_explicit)
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
# MS isotope pattern
# --------------------------------------------------------------------------- #
# Per-element isotope abundances keyed by *nominal* mass shift above the lightest
# isotope (Da).  Convolving these distributions gives the full M, M+1, M+2, M+4 …
# envelope, so multi-halogen patterns (the binomial M+2/M+4/… series) come out right.
ISOTOPE_ABUNDANCE: dict[str, dict[int, float]] = {
    "H":  {0: 0.999885, 1: 0.000115},
    "C":  {0: 0.989300, 1: 0.010700},
    "N":  {0: 0.996360, 1: 0.003640},
    "O":  {0: 0.997570, 1: 0.000380, 2: 0.002050},
    "S":  {0: 0.949900, 1: 0.007500, 2: 0.042500},
    "Si": {0: 0.922230, 1: 0.046850, 2: 0.030920},
    "Cl": {0: 0.757600, 2: 0.242400},   # 35Cl / 37Cl
    "Br": {0: 0.506900, 2: 0.493100},   # 79Br / 81Br
}
# Average nominal isotope spacing (Da); peaks are 13C/37Cl/81Br-spaced, so ~1 Da each.
_ISOTOPE_STEP = 1.00286
_PEAK_THRESHOLD = 0.1  # drop peaks below 0.1% of the monoisotopic peak


def _convolve(a: dict[int, float], b: dict[int, float]) -> dict[int, float]:
    out: dict[int, float] = {}
    for sa, pa in a.items():
        for sb, pb in b.items():
            out[sa + sb] = out.get(sa + sb, 0.0) + pa * pb
    return out


def _poly_pow(p: dict[int, float], n: int) -> dict[int, float]:
    """The isotope distribution for n identical atoms — p convolved with itself n times."""
    result = {0: 1.0}
    base = dict(p)
    while n:
        if n & 1:
            result = _convolve(result, base)
        n >>= 1
        if n:
            base = _convolve(base, base)
    return result


def isotope_pattern(formula: str) -> list[dict]:
    """Predicted MS isotope envelope as peaks relative to the monoisotopic peak (=100%).

    Builds the exact (within nominal-mass resolution) distribution by convolving each
    element's isotope abundances, so the M+2/M+4/… series of multi-halogen compounds
    follows the correct binomial envelope — e.g. dichloro gives M:M+2:M+4 ≈ 9:6:1 and
    dibromo gives ≈ 1:2:1.
    """
    counts = parse_formula(formula)
    base = mass_from_formula(formula, monoisotopic=True)

    dist: dict[int, float] = {0: 1.0}
    for el, n in counts.items():
        abund = ISOTOPE_ABUNDANCE.get(el)
        if not abund or n <= 0:
            continue
        dist = _convolve(dist, _poly_pow(abund, n))

    mono = dist.get(0, 1.0) or 1.0
    peaks = []
    for shift in sorted(dist):
        intensity = dist[shift] / mono * 100.0
        if shift != 0 and intensity < _PEAK_THRESHOLD:
            continue
        peaks.append({
            "mz": round(base + shift * _ISOTOPE_STEP, 4),
            "intensity": round(intensity, 2),
            "label": "M" if shift == 0 else f"M+{shift}",
        })
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
# Equation balancing + stoichiometry
# --------------------------------------------------------------------------- #
def _rational_nullspace(matrix: list[list[int]]) -> list[list[Fraction]]:
    """Exact nullspace basis of an integer matrix via Gauss-Jordan over Fractions.

    Returns a list of basis vectors (each a list of Fractions). The number of
    vectors is the nullity (cols - rank).
    """
    rows = len(matrix)
    cols = len(matrix[0]) if rows else 0
    m = [[Fraction(x) for x in row] for row in matrix]

    pivot_cols: list[int] = []
    r = 0
    for c in range(cols):
        pivot = next((i for i in range(r, rows) if m[i][c] != 0), None)
        if pivot is None:
            continue
        m[r], m[pivot] = m[pivot], m[r]
        pv = m[r][c]
        m[r] = [x / pv for x in m[r]]
        for i in range(rows):
            if i != r and m[i][c] != 0:
                factor = m[i][c]
                m[i] = [a - factor * b for a, b in zip(m[i], m[r])]
        pivot_cols.append(c)
        r += 1
        if r == rows:
            break

    free_cols = [c for c in range(cols) if c not in pivot_cols]
    basis: list[list[Fraction]] = []
    for free in free_cols:
        vec = [Fraction(0)] * cols
        vec[free] = Fraction(1)
        for ri, pc in enumerate(pivot_cols):
            vec[pc] = -m[ri][free]
        basis.append(vec)
    return basis


def _format_equation(reactants: list[dict], products: list[dict]) -> str:
    def side(items: list[dict]) -> str:
        return " + ".join(
            f"{it['coeff']} {it['formula']}" if it["coeff"] != 1 else it["formula"]
            for it in items
        )
    return f"{side(reactants)} -> {side(products)}"


def balance_reaction(reactants: list[str], products: list[str]) -> dict:
    """Balance a chemical equation, returning smallest positive integer coefficients.

    Builds the element-count matrix (reactants positive, products negative) and
    finds its 1-D rational nullspace, then scales to the smallest integer set.
    Raises ValueError when the reaction cannot be balanced or is ambiguous.
    """
    reactants = [r.strip() for r in reactants if r and r.strip()]
    products = [p.strip() for p in products if p and p.strip()]
    if not reactants or not products:
        raise ValueError("Need at least one reactant and one product.")

    parsed = [parse_formula(s) for s in reactants + products]
    elements = sorted({el for counts in parsed for el in counts})
    if not elements:
        raise ValueError("No recognizable element symbols in the formulas.")
    n_react = len(reactants)

    # rows = elements, cols = species; reactants contribute +, products −.
    matrix = [
        [(counts.get(el, 0) if j < n_react else -counts.get(el, 0))
         for j, counts in enumerate(parsed)]
        for el in elements
    ]

    basis = _rational_nullspace(matrix)
    if len(basis) == 0:
        raise ValueError(
            "Reaction cannot be balanced — elements don't reconcile between sides.")
    if len(basis) > 1:
        raise ValueError(
            "Reaction is underdetermined — multiple independent balances exist. "
            "Split it into separate equations or specify more species.")

    vec = basis[0]
    denom_lcm = reduce(lcm, (f.denominator for f in vec), 1)
    coeffs = [int(f * denom_lcm) for f in vec]
    common = reduce(gcd, (abs(c) for c in coeffs if c), 0)
    if common:
        coeffs = [c // common for c in coeffs]

    # A valid balance is a single sign; normalize to all-positive.
    first_nonzero = next((c for c in coeffs if c), 0)
    if first_nonzero < 0:
        coeffs = [-c for c in coeffs]
    if any(c <= 0 for c in coeffs):
        raise ValueError(
            "No all-positive integer balance exists for this reaction.")

    react_items = [{"coeff": coeffs[i], "formula": reactants[i]} for i in range(n_react)]
    prod_items = [{"coeff": coeffs[n_react + i], "formula": products[i]}
                  for i in range(len(products))]
    return {
        "reactants": react_items,
        "products": prod_items,
        "equation": _format_equation(react_items, prod_items),
    }


def _amount_to_moles(formula: str, amount: Optional[dict]) -> Optional[float]:
    """Convert an amount dict ({'moles': x} or {'grams': x}) to moles."""
    if not amount:
        return None
    if amount.get("moles") is not None:
        return float(amount["moles"])
    if amount.get("grams") is not None:
        return grams_to_moles(formula, float(amount["grams"]))
    return None


def stoichiometry(balanced: dict, amounts: dict[str, dict],
                  actual: Optional[dict[str, dict]] = None) -> dict:
    """Compute limiting reagent, theoretical yields, and percent yield.

    balanced: output of balance_reaction.
    amounts:  {reactant_formula: {'grams'|'moles': value}} for supplied inputs.
    actual:   {product_formula: {'grams'|'moles': value}} measured yields (optional).
    """
    reactants = balanced["reactants"]
    products = balanced["products"]
    amounts = amounts or {}
    actual = actual or {}

    # Reaction extent (mol of reaction) per supplied reactant = moles / coeff.
    extents = []
    for r in reactants:
        moles = _amount_to_moles(r["formula"], amounts.get(r["formula"]))
        if moles is not None:
            extents.append((r["formula"], moles / r["coeff"]))
    if not extents:
        raise ValueError("Provide an amount (grams or moles) for at least one reactant.")
    limiting_formula, extent = min(extents, key=lambda x: x[1])

    reagent_rows = []
    for r in reactants:
        moles = _amount_to_moles(r["formula"], amounts.get(r["formula"]))
        mm = mass_from_formula(r["formula"])
        consumed = extent * r["coeff"]
        reagent_rows.append({
            "formula": r["formula"],
            "coeff": r["coeff"],
            "molar_mass": round(mm, 4) if mm else None,
            "moles": round(moles, 6) if moles is not None else None,
            "grams": round(moles * mm, 4) if (moles is not None and mm) else None,
            "limiting": r["formula"] == limiting_formula,
            "consumed_moles": round(consumed, 6),
            "excess_moles": round(moles - consumed, 6) if moles is not None else None,
        })

    product_rows = []
    for p in products:
        mm = mass_from_formula(p["formula"])
        theo_moles = extent * p["coeff"]
        row = {
            "formula": p["formula"],
            "coeff": p["coeff"],
            "molar_mass": round(mm, 4) if mm else None,
            "theoretical_moles": round(theo_moles, 6),
            "theoretical_grams": round(theo_moles * mm, 4) if mm else None,
        }
        act_moles = _amount_to_moles(p["formula"], actual.get(p["formula"]))
        if act_moles is not None and theo_moles > 0:
            row["actual_moles"] = round(act_moles, 6)
            row["actual_grams"] = round(act_moles * mm, 4) if mm else None
            row["percent_yield"] = round(act_moles / theo_moles * 100, 2)
        product_rows.append(row)

    return {
        "limiting": limiting_formula,
        "extent": round(extent, 6),
        "reagents": reagent_rows,
        "products": product_rows,
    }


# --------------------------------------------------------------------------- #
# Solution / mass conversions
# --------------------------------------------------------------------------- #
def grams_to_moles(formula: str, grams: float) -> float:
    mm = mass_from_formula(formula)
    if not mm:
        raise ValueError(f"Unknown molar mass for {formula!r}.")
    return grams / mm


def moles_to_grams(formula: str, moles: float) -> float:
    return moles * mass_from_formula(formula)


def molarity(volume_l: float, moles: Optional[float] = None,
             grams: Optional[float] = None, formula: Optional[str] = None) -> float:
    """Molar concentration C = n / V. Supply moles, or grams + formula."""
    if not volume_l or volume_l <= 0:
        raise ValueError("Volume must be positive (in liters).")
    if moles is None:
        if grams is None or not formula:
            raise ValueError("Provide moles, or grams together with a formula.")
        moles = grams_to_moles(formula, grams)
    return moles / volume_l


def dilution(c1: Optional[float] = None, v1: Optional[float] = None,
             c2: Optional[float] = None, v2: Optional[float] = None) -> float:
    """Solve C1·V1 = C2·V2 for the single missing value (the other three given)."""
    given = {"c1": c1, "v1": v1, "c2": c2, "v2": v2}
    missing = [k for k, v in given.items() if v is None]
    if len(missing) != 1:
        raise ValueError("Provide exactly three of C1, V1, C2, V2 to solve for the fourth.")
    target = missing[0]
    if target == "c1":
        return (c2 * v2) / v1
    if target == "v1":
        return (c2 * v2) / c1
    if target == "c2":
        return (c1 * v1) / v2
    return (c1 * v1) / c2


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


# --------------------------------------------------------------------------- #
# Acid–base chemistry (pH, buffers, titration)
#
# All equilibria assume 25 °C aqueous solution (Kw = 1e-14, pKw = 14). Volumes
# are expressed in millilitres and concentrations in mol/L throughout.
# --------------------------------------------------------------------------- #
KW = 1.0e-14   # ion product of water at 25 °C

# Reference pKa / pKb for acids, conjugate acids, and common lab buffers. Each
# entry lists every dissociation step (polyprotic acids list all pKa values).
PKA_TABLE: dict[str, dict] = {
    # — strong acids/bases (effectively complete dissociation) —
    "hydrochloric acid": {"type": "strong_acid", "pka": [-6.3]},
    "nitric acid":       {"type": "strong_acid", "pka": [-1.4]},
    "sulfuric acid":     {"type": "strong_acid", "pka": [-3.0, 1.99]},
    "sodium hydroxide":  {"type": "strong_base", "pkb": [-0.6]},
    "potassium hydroxide": {"type": "strong_base", "pkb": [-0.7]},
    # — weak acids —
    "acetic acid":       {"type": "weak_acid", "pka": [4.76]},
    "formic acid":       {"type": "weak_acid", "pka": [3.75]},
    "lactic acid":       {"type": "weak_acid", "pka": [3.86]},
    "benzoic acid":      {"type": "weak_acid", "pka": [4.20]},
    "hydrofluoric acid": {"type": "weak_acid", "pka": [3.17]},
    "carbonic acid":     {"type": "weak_acid", "pka": [6.35, 10.33]},
    "phosphoric acid":   {"type": "weak_acid", "pka": [2.15, 7.20, 12.35]},
    "citric acid":       {"type": "weak_acid", "pka": [3.13, 4.76, 6.40]},
    # — weak bases (pKb), plus the pKa of their conjugate acid —
    "ammonia":           {"type": "weak_base", "pkb": [4.75], "pka_conj": [9.25]},
    "methylamine":       {"type": "weak_base", "pkb": [3.36], "pka_conj": [10.64]},
    "pyridine":          {"type": "weak_base", "pkb": [8.75], "pka_conj": [5.25]},
    # — common biological buffers (reported as the pKa of the buffering group) —
    "mes":     {"type": "buffer", "pka": [6.10]},
    "bis-tris": {"type": "buffer", "pka": [6.46]},
    "pipes":   {"type": "buffer", "pka": [6.76]},
    "imidazole": {"type": "buffer", "pka": [6.95]},
    "mops":    {"type": "buffer", "pka": [7.20]},
    "hepes":   {"type": "buffer", "pka": [7.48]},
    "tris":    {"type": "buffer", "pka": [8.07]},
    "glycine": {"type": "amino_acid", "pka": [2.34, 9.60]},
}


def _ka_from_pka(pka: float) -> float:
    return 10.0 ** (-pka)


def ph_strong(conc: float, kind: str = "acid") -> float:
    """pH of a strong monoprotic acid or base at concentration ``conc`` (mol/L).

    Accounts for water autoionization so that very dilute solutions converge to
    pH 7 rather than diverging. ``kind`` is ``"acid"`` or ``"base"``.
    """
    c = max(float(conc), 0.0)
    # [H+] (acid) or [OH-] (base) from x^2 - c*x - Kw = 0 → x = (c + sqrt(c²+4Kw))/2
    x = (c + math.sqrt(c * c + 4.0 * KW)) / 2.0
    p = -math.log10(x)
    is_base = str(kind).lower() in ("base", "strong_base")
    return round(14.0 - p if is_base else p, 4)


def ph_weak(conc: float, ka: float, kind: str = "acid") -> float:
    """pH of a weak monoprotic acid (or base, when ``ka`` is its Kb) of the given
    concentration. Solves the dissociation quadratic
    ``x² + Ka·x − Ka·C = 0`` for ``x = [H⁺]`` (or ``[OH⁻]`` for a base)."""
    c = max(float(conc), 0.0)
    ka = float(ka)
    if c <= 0 or ka <= 0:
        raise ValueError("concentration and Ka must be positive")
    x = (-ka + math.sqrt(ka * ka + 4.0 * ka * c)) / 2.0
    p = -math.log10(x)
    is_base = str(kind).lower() in ("base", "weak_base")
    return round(14.0 - p if is_base else p, 4)


def buffer_ph(acid: float, base: float, pka: float) -> float:
    """Henderson–Hasselbalch buffer pH: ``pH = pKa + log10([base]/[acid])``.

    ``acid`` and ``base`` are the concentrations (or moles, since the ratio is
    what matters) of the conjugate acid/base pair.
    """
    if acid <= 0 or base <= 0:
        raise ValueError("acid and base amounts must be positive")
    return round(float(pka) + math.log10(float(base) / float(acid)), 4)


def _solve_ph(f, lo: float = -2.0, hi: float = 16.0, iters: int = 100) -> float:
    """Bisection for a charge-balance residual ``f(pH)`` that is monotonically
    decreasing in pH (f > 0 ⇒ solution is more acidic than ``pH``)."""
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def _ph_acid_with_base(ca_tot: float, cb_strong: float, ka: Optional[float]) -> float:
    """pH of an acid (total conc ``ca_tot``) partially neutralised by strong base
    (added strong-base concentration ``cb_strong``), from the charge balance
        cb_strong + [H+] = Kw/[H+] + α·ca_tot
    where α = Ka/(Ka+[H+]) for a weak acid, or 1 for a strong acid (``ka`` None)."""
    def f(ph: float) -> float:
        h = 10.0 ** (-ph)
        alpha = 1.0 if ka is None else ka / (ka + h)
        return cb_strong + h - KW / h - alpha * ca_tot
    return _solve_ph(f)


def _ph_base_with_acid(cb_tot: float, ca_strong: float, kb: Optional[float]) -> float:
    """pH of a base (total conc ``cb_tot``) partially neutralised by strong acid
    (added strong-acid concentration ``ca_strong``), from the charge balance
        [BH+] + [H+] = Kw/[H+] + ca_strong
    with [BH+] = cb_tot·[H+]/([H+]+Ka_conj), Ka_conj = Kw/Kb (or cb_tot for a
    strong base, ``kb`` None — the spectator cation carries the full charge)."""
    ka_conj = None if kb is None else KW / kb
    def f(ph: float) -> float:
        h = 10.0 ** (-ph)
        bh = cb_tot if ka_conj is None else cb_tot * h / (h + ka_conj)
        return bh + h - KW / h - ca_strong
    return _solve_ph(f)


def titration_curve(analyte: dict, titrant: dict, ka: Optional[float] = None,
                    n_points: int = 121) -> dict:
    """Acid–base titration curve (pH vs added titrant volume).

    analyte: {"conc": mol/L, "volume": mL, "kind": one of
              "strong_acid"|"weak_acid"|"strong_base"|"weak_base",
              optional "ka"/"pka" (acid) or "kb"/"pkb" (base)}
    titrant: {"conc": mol/L, "kind": "strong_base"|"strong_acid"}
    ka:      Ka of a weak-acid analyte (overrides analyte["ka"]/["pka"]).

    Returns the sampled curve plus the equivalence point, the half-equivalence
    point (pH = pKa, weak analytes only), and the buffer region (the ~pKa ± 1
    window, i.e. 10 %–90 % of the way to equivalence) for shading.
    """
    kind = str(analyte.get("kind", "strong_acid")).lower()
    ca = float(analyte["conc"])
    va = float(analyte["volume"])           # mL
    ct = float(titrant["conc"])
    if ca <= 0 or va <= 0 or ct <= 0:
        raise ValueError("concentrations and analyte volume must be positive")

    is_acid_analyte = kind in ("strong_acid", "weak_acid")
    is_weak = kind in ("weak_acid", "weak_base")

    # Resolve the dissociation constant for a weak analyte.
    k_weak: Optional[float] = None
    pk: Optional[float] = None
    if is_weak:
        if is_acid_analyte:
            if ka is not None:
                k_weak = float(ka)
            elif analyte.get("ka") is not None:
                k_weak = float(analyte["ka"])
            elif analyte.get("pka") is not None:
                k_weak = _ka_from_pka(float(analyte["pka"]))
            else:
                raise ValueError("weak_acid analyte requires ka or pka")
            pk = -math.log10(k_weak)
        else:
            if analyte.get("kb") is not None:
                k_weak = float(analyte["kb"])
            elif analyte.get("pkb") is not None:
                k_weak = _ka_from_pka(float(analyte["pkb"]))
            elif ka is not None:                       # interpret bare ka as Kb
                k_weak = float(ka)
            else:
                raise ValueError("weak_base analyte requires kb or pkb")
            # Half-equivalence pH for a base = pKa of its conjugate acid.
            pk = -math.log10(KW / k_weak)

    n_analyte = ca * va / 1000.0                # moles of acid or base
    v_eq = n_analyte / ct * 1000.0             # mL of titrant to reach equivalence

    v_max = max(2.0 * v_eq, v_eq + 1e-9)
    points: list[dict] = []
    for i in range(n_points):
        vb = v_max * i / (n_points - 1)
        ph = _ph_at_volume(vb, n_analyte, va, ct, kind, k_weak)
        points.append({"volume": round(vb, 4), "ph": round(ph, 4)})

    eq_ph = _ph_at_volume(v_eq, n_analyte, va, ct, kind, k_weak)
    result: dict = {
        "points": points,
        "equivalence": {"volume": round(v_eq, 4), "ph": round(eq_ph, 4)},
        "half_equivalence": None,
        "buffer_region": None,
        "pka": round(pk, 4) if pk is not None else None,
        "analyte_kind": kind,
        "titrant_kind": str(titrant.get("kind", "")).lower(),
        "units": {"volume": "mL", "conc": "mol/L"},
    }
    if is_weak:
        half_v = v_eq / 2.0
        half_ph = _ph_at_volume(half_v, n_analyte, va, ct, kind, k_weak)
        result["half_equivalence"] = {"volume": round(half_v, 4), "ph": round(half_ph, 4)}
        # Effective buffering window: 10 %–90 % neutralised ≈ pKa ± 1.
        result["buffer_region"] = {
            "start": round(0.1 * v_eq, 4),
            "end": round(0.9 * v_eq, 4),
            "ph_low": round(pk - 1.0, 4) if pk is not None else None,
            "ph_high": round(pk + 1.0, 4) if pk is not None else None,
        }
    return result


def _ph_at_volume(vb: float, n_analyte: float, va: float, ct: float,
                  kind: str, k_weak: Optional[float]) -> float:
    """pH after ``vb`` mL of titrant added to ``va`` mL of analyte (``n_analyte``
    moles). Dispatches to the acid- or base-analyte charge balance."""
    v_total_l = (va + vb) / 1000.0
    n_titrant = ct * vb / 1000.0
    analyte_conc = n_analyte / v_total_l
    titrant_conc = n_titrant / v_total_l
    if kind in ("strong_acid", "weak_acid"):
        return _ph_acid_with_base(analyte_conc, titrant_conc, k_weak)
    return _ph_base_with_acid(analyte_conc, titrant_conc, k_weak)
