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
    ("c1ccccc1", "C6H6"),                   # benzene (aromatic / lowercase)
    ("C1=CC=CC=C1", "C6H6"),                # benzene (Kekulé / explicit double bonds)
    ("Nc1ccccc1", "C6H7N"),                 # aniline (aromatic notation)
    ("NC1=CC=CC=C1", "C6H7N"),              # aniline (Kekulé notation)
    ("c1ccncc1", "C5H5N"),                  # pyridine (aromatic N, no H)
    ("C1CCCCC1", "C6H12"),                  # cyclohexane
    ("CC(=O)OC1=CC=CC=C1C(=O)O", "C9H8O4"), # aspirin
    ("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "C8H10N4O2"),  # caffeine
])
def test_formula_from_smiles(smiles, formula):
    assert chem.formula_from_smiles(smiles) == formula


def test_benzene_kekule_matches_aromatic():
    """Kekulé and lowercase-aromatic benzene must give the same formula."""
    assert (chem.formula_from_smiles("C1=CC=CC=C1")
            == chem.formula_from_smiles("c1ccccc1")
            == "C6H6")


@pytest.mark.parametrize("smiles,formula", [
    ("[NH4+]", "H4N"),          # ammonium — 4 explicit H, charge does not change it
    ("[OH-]", "HO"),            # hydroxide — 1 explicit H
    ("CC(=O)[O-]", "C2H3O2"),   # acetate — bracket O carries no implicit H
    ("[Na+]", "Na"),            # sodium cation — no H
])
def test_bracket_charge_implicit_h(smiles, formula):
    """Bracket atoms take H only from an explicit Hn; charge has no H effect."""
    assert chem.formula_from_smiles(smiles) == formula


def test_ring_closure_bond_order_consistency():
    """A ring-closure bond symbol works at either the opening or closing digit."""
    assert (chem.formula_from_smiles("C=1CCCCC1")      # double bond on the open digit
            == chem.formula_from_smiles("C1CCCCC=1")   # ...same bond on the close digit
            == "C6H10")                                # cyclohexene


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


def _by_label(peaks):
    return {p["label"]: p["intensity"] for p in peaks}


def test_isotope_pattern_dichloro_envelope():
    """Two chlorines give the binomial M:M+2:M+4 ≈ 9:6:1 envelope."""
    pk = _by_label(chem.isotope_pattern("C6H4Cl2"))   # dichlorobenzene
    assert pk["M"] == 100.0
    # Normalised to M=100, the ideal pattern is 100 : 66.7 : 11.1.
    assert pk["M+2"] == pytest.approx(66.7, abs=6)
    assert pk["M+4"] == pytest.approx(11.1, abs=3)
    # And the M+2 : M+4 ratio is ~6 : 1 (the middle:edge of a 9:6:1 triplet).
    assert pk["M+2"] / pk["M+4"] == pytest.approx(6.0, abs=1.0)


def test_isotope_pattern_dibromo_envelope():
    """Two bromines give the near-symmetric M:M+2:M+4 ≈ 1:2:1 envelope."""
    pk = _by_label(chem.isotope_pattern("C6H4Br2"))   # dibromobenzene
    assert pk["M+2"] == pytest.approx(195, abs=20)     # ~2x the M peak
    assert pk["M+4"] == pytest.approx(95, abs=20)      # ~1x the M peak


# --------------------------------------------------------------------------- #
# Offline mass vs. PubChem exact mass
# --------------------------------------------------------------------------- #
# Monoisotopic exact masses from PubChem (ExactMass property) for cross-checking the
# network-free fallback.  smiles -> (expected formula, PubChem exact mass).
_PUBCHEM_EXACT = {
    "c1ccccc1": ("C6H6", 78.0470),                          # benzene
    "CC(=O)OC1=CC=CC=C1C(=O)O": ("C9H8O4", 180.0423),       # aspirin
    "CN1C=NC2=C1C(=O)N(C(=O)N2C)C": ("C8H10N4O2", 194.0804),  # caffeine
    "CCO": ("C2H6O", 46.0419),                              # ethanol
}


@pytest.mark.parametrize("smiles,expected", _PUBCHEM_EXACT.items())
def test_offline_mass_within_tolerance_of_pubchem(smiles, expected):
    formula, exact = expected
    assert chem.formula_from_smiles(smiles) == formula
    mono = chem.mass_from_formula(formula, monoisotopic=True)
    assert mono == pytest.approx(exact, abs=0.01)


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


# --------------------------------------------------------------------------- #
# Equation balancing
# --------------------------------------------------------------------------- #
def _coeffs(side):
    return {it["formula"]: it["coeff"] for it in side}


def test_balance_propane_combustion():
    # C3H8 + 5 O2 -> 3 CO2 + 4 H2O
    res = chem.balance_reaction(["C3H8", "O2"], ["CO2", "H2O"])
    assert _coeffs(res["reactants"]) == {"C3H8": 1, "O2": 5}
    assert _coeffs(res["products"]) == {"CO2": 3, "H2O": 4}
    assert res["equation"] == "C3H8 + 5 O2 -> 3 CO2 + 4 H2O"


def test_balance_redox_permanganate():
    # 2 KMnO4 + 16 HCl -> 2 KCl + 2 MnCl2 + 8 H2O + 5 Cl2  (Mn +7→+2, Cl −1→0)
    res = chem.balance_reaction(["KMnO4", "HCl"], ["KCl", "MnCl2", "H2O", "Cl2"])
    assert _coeffs(res["reactants"]) == {"KMnO4": 2, "HCl": 16}
    assert _coeffs(res["products"]) == {"KCl": 2, "MnCl2": 2, "H2O": 8, "Cl2": 5}


def test_balance_smallest_integers():
    # Hydrogen + oxygen must reduce to 2 H2 + O2 -> 2 H2O, not 4/2/4.
    res = chem.balance_reaction(["H2", "O2"], ["H2O"])
    assert _coeffs(res["reactants"]) == {"H2": 2, "O2": 1}
    assert _coeffs(res["products"]) == {"H2O": 2}


def test_balance_unbalanceable_raises():
    with pytest.raises(ValueError):
        chem.balance_reaction(["C"], ["O2"])  # no shared element → no solution


# --------------------------------------------------------------------------- #
# Stoichiometry / limiting reagent
# --------------------------------------------------------------------------- #
def test_stoichiometry_limiting_reagent_textbook():
    # Haber: N2 + 3 H2 -> 2 NH3. 2.80 g N2 (~0.0999 mol) with 1.00 g H2 (~0.496 mol).
    # N2 extent 0.0999, H2 extent 0.165 → N2 is limiting; NH3 ≈ 0.20 mol ≈ 3.40 g.
    balanced = chem.balance_reaction(["N2", "H2"], ["NH3"])
    res = chem.stoichiometry(
        balanced,
        {"N2": {"grams": 2.80}, "H2": {"grams": 1.00}},
        actual={"NH3": {"grams": 2.50}},
    )
    assert res["limiting"] == "N2"

    n2 = next(r for r in res["reagents"] if r["formula"] == "N2")
    h2 = next(r for r in res["reagents"] if r["formula"] == "H2")
    assert n2["limiting"] is True and h2["limiting"] is False
    assert h2["excess_moles"] > 0  # hydrogen left over

    nh3 = res["products"][0]
    assert nh3["theoretical_moles"] == pytest.approx(0.1999, abs=1e-3)
    assert nh3["theoretical_grams"] == pytest.approx(3.405, abs=0.02)
    assert nh3["percent_yield"] == pytest.approx(2.50 / nh3["theoretical_grams"] * 100, abs=0.1)


def test_stoichiometry_accepts_moles_and_no_actual():
    balanced = chem.balance_reaction(["C3H8", "O2"], ["CO2", "H2O"])
    res = chem.stoichiometry(balanced, {"C3H8": {"moles": 1.0}, "O2": {"moles": 5.0}})
    # Perfectly stoichiometric — either could be limiting; CO2 = 3 mol, H2O = 4 mol.
    co2 = next(p for p in res["products"] if p["formula"] == "CO2")
    h2o = next(p for p in res["products"] if p["formula"] == "H2O")
    assert co2["theoretical_moles"] == pytest.approx(3.0)
    assert h2o["theoretical_moles"] == pytest.approx(4.0)
    assert "percent_yield" not in co2  # no actual yield supplied


def test_stoichiometry_requires_an_amount():
    balanced = chem.balance_reaction(["N2", "H2"], ["NH3"])
    with pytest.raises(ValueError):
        chem.stoichiometry(balanced, {})


# --------------------------------------------------------------------------- #
# Solution / mass conversions
# --------------------------------------------------------------------------- #
def test_grams_moles_roundtrip():
    moles = chem.grams_to_moles("H2O", 18.015)
    assert moles == pytest.approx(1.0, abs=1e-3)
    assert chem.moles_to_grams("H2O", moles) == pytest.approx(18.015, abs=0.01)


def test_molarity_and_dilution():
    # 1 mol NaCl in 0.5 L → 2 M.
    assert chem.molarity(volume_l=0.5, moles=1.0) == pytest.approx(2.0)
    # 58.44 g NaCl (~1 mol) in 1 L → ~1 M.
    assert chem.molarity(volume_l=1.0, grams=58.44, formula="NaCl") == pytest.approx(1.0, abs=0.01)
    # C1V1 = C2V2: dilute 10 M by taking V1 to reach 1 M in 100 mL → 10 mL.
    assert chem.dilution(c1=10, c2=1, v2=100) == pytest.approx(10.0)


def test_dilution_requires_three_values():
    with pytest.raises(ValueError):
        chem.dilution(c1=10, c2=1)


# --------------------------------------------------------------------------- #
# Acid–base: pH of strong / weak acids and bases
# --------------------------------------------------------------------------- #
def test_ph_strong_acid_and_base():
    # 0.1 M strong acid → pH 1; 0.1 M strong base → pH 13.
    assert chem.ph_strong(0.1) == pytest.approx(1.0, abs=1e-3)
    assert chem.ph_strong(0.1, kind="base") == pytest.approx(13.0, abs=1e-3)


def test_ph_strong_acid_dilute_converges_to_neutral():
    # Vanishingly dilute strong acid must approach pH 7, not diverge above it.
    ph = chem.ph_strong(1e-9)
    assert 6.9 < ph <= 7.0


def test_ph_weak_acid():
    # 0.1 M acetic acid (pKa 4.76) → pH ≈ 2.87.
    ka = 10 ** -4.76
    assert chem.ph_weak(0.1, ka) == pytest.approx(2.87, abs=0.02)


def test_buffer_henderson_hasselbalch():
    # Equal acid/base → pH = pKa; 10:1 base:acid → pKa + 1.
    assert chem.buffer_ph(acid=0.1, base=0.1, pka=4.76) == pytest.approx(4.76, abs=1e-6)
    assert chem.buffer_ph(acid=0.1, base=1.0, pka=4.76) == pytest.approx(5.76, abs=1e-6)


# --------------------------------------------------------------------------- #
# Acid–base: titration curves
# --------------------------------------------------------------------------- #
def test_titration_strong_acid_strong_base_equivalence_ph7():
    curve = chem.titration_curve(
        {"conc": 0.1, "volume": 25.0, "kind": "strong_acid"},
        {"conc": 0.1, "kind": "strong_base"},
    )
    # Equivalence after 25 mL of equal-strength base, at pH 7.
    assert curve["equivalence"]["volume"] == pytest.approx(25.0, abs=1e-6)
    assert curve["equivalence"]["ph"] == pytest.approx(7.0, abs=1e-6)
    # Curve starts acidic (strong acid) and ends basic (excess strong base).
    assert curve["points"][0]["ph"] == pytest.approx(1.0, abs=0.05)
    assert curve["points"][-1]["ph"] > 11.0
    assert curve["half_equivalence"] is None     # no buffering for a strong acid


def test_titration_weak_acid_half_equivalence_ph_equals_pka():
    pka = 4.76
    curve = chem.titration_curve(
        {"conc": 0.1, "volume": 25.0, "kind": "weak_acid", "pka": pka},
        {"conc": 0.1, "kind": "strong_base"},
    )
    # Half-equivalence sits at half the titrant volume, where pH = pKa.
    assert curve["half_equivalence"]["volume"] == pytest.approx(12.5, abs=1e-6)
    assert curve["half_equivalence"]["ph"] == pytest.approx(pka, abs=0.02)
    assert curve["pka"] == pytest.approx(pka, abs=1e-6)
    # Equivalence of a weak acid + strong base is basic (conjugate base hydrolyses).
    assert curve["equivalence"]["ph"] > 7.5
    # Buffer region brackets the half-equivalence volume.
    br = curve["buffer_region"]
    assert br["start"] < 12.5 < br["end"]


def test_titration_weak_base_half_equivalence():
    # Ammonia (pKb 4.75) titrated with strong acid: half-eq pH = pKa(NH4+) ≈ 9.25.
    curve = chem.titration_curve(
        {"conc": 0.1, "volume": 25.0, "kind": "weak_base", "pkb": 4.75},
        {"conc": 0.1, "kind": "strong_acid"},
    )
    assert curve["half_equivalence"]["ph"] == pytest.approx(9.25, abs=0.03)
    assert curve["equivalence"]["ph"] < 7.0       # conjugate acid → acidic equivalence


def test_pka_table_has_common_entries():
    assert "acetic acid" in chem.PKA_TABLE
    assert chem.PKA_TABLE["acetic acid"]["pka"][0] == pytest.approx(4.76, abs=0.01)
