"""Phase 4 tests: chemistry module — formula parsing, masses, isotopes, Lipinski,
reaction SMILES, and reaction kinetics. Network-independent (no PubChem calls)."""

import pytest

from modules.chemistry import core as chem


# --------------------------------------------------------------------------- #
# Formula / mass
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("smiles,formula", [
    ("CCO", "C2H6O"),                       # ethanol
    ("O", "H2O"),                           # water
    ("c1ccccc1", "C6H6"),                   # benzene (aromatic)
    ("C1CCCCC1", "C6H12"),                  # cyclohexane
    ("CC(=O)OC1=CC=CC=C1C(=O)O", "C9H8O4"), # aspirin
    ("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "C8H10N4O2"),  # caffeine
])
def test_formula_from_smiles(smiles, formula):
    assert chem.formula_from_smiles(smiles) == formula


def test_mass_from_formula():
    assert chem.mass_from_formula("H2O") == pytest.approx(18.015, abs=0.01)
    assert chem.mass_from_formula("C9H8O4") == pytest.approx(180.16, abs=0.1)


def test_exact_mass_is_monoisotopic():
    avg = chem.mass_from_formula("C9H8O4")
    mono = chem.mass_from_formula("C9H8O4", monoisotopic=True)
    assert mono < avg  # monoisotopic uses lightest isotopes


# --------------------------------------------------------------------------- #
# Isotope pattern
# --------------------------------------------------------------------------- #
def test_isotope_pattern_base_peak():
    peaks = chem.isotope_pattern("C9H8O4")
    assert peaks[0]["label"] == "M" and peaks[0]["intensity"] == 100.0
    # 9 carbons → M+1 around 9-10%
    m1 = next(p for p in peaks if p["label"] == "M+1")
    assert 8 < m1["intensity"] < 12


def test_isotope_pattern_chlorine_m2():
    # One Cl gives a strong (~32%) M+2 peak.
    peaks = chem.isotope_pattern("C2H3Cl")
    m2 = next((p for p in peaks if p["label"] == "M+2"), None)
    assert m2 and m2["intensity"] > 25


# --------------------------------------------------------------------------- #
# Lipinski
# --------------------------------------------------------------------------- #
def test_lipinski_pass_and_fail():
    ok = chem.lipinski(mw=180, logp=1.2, hbd=1, hba=4)
    assert ok["passes"] and ok["violations"] == 0
    bad = chem.lipinski(mw=900, logp=8, hbd=8, hba=20)
    assert not bad["passes"] and bad["violations"] >= 2


# --------------------------------------------------------------------------- #
# Reaction SMILES + kinetics
# --------------------------------------------------------------------------- #
def test_reaction_smiles_assembly():
    rs = chem.reaction_smiles(["CCO", "OC(=O)C"], ["CCOC(C)=O"], ["[H+]"])
    assert rs == "CCO.OC(=O)C>[H+]>CCOC(C)=O"


def test_kinetics_conserves_and_progresses():
    # A + B -> C ; C should rise, A and B should fall.
    res = chem.kinetics(
        [{"reactants": ["A", "B"], "products": ["C"], "k": 0.5}],
        {"A": 1.0, "B": 1.0, "C": 0.0}, t_end=50,
    )
    names = [s["name"] for s in res["series"]]
    c = res["series"][names.index("C")]["values"]
    a = res["series"][names.index("A")]["values"]
    assert c[-1] > c[0]
    assert a[-1] < a[0]


def test_kinetics_michaelis_menten():
    res = chem.kinetics(
        [{"type": "mm", "substrate": "S", "product": "P", "vmax": 1.0, "km": 0.5}],
        {"S": 2.0, "P": 0.0}, t_end=20,
    )
    p = res["series"][[s["name"] for s in res["series"]].index("P")]["values"]
    assert p[-1] > 1.0  # substrate largely converted
