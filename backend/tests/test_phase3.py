"""Phase 3 tests: design-failure checks (#5–#7), sensitivity analysis, sim history."""

from compiler import assembler, parser, validate
from models.schemas import Circuit, CircuitNode, TranscriptionUnit
from simulation import ode
from storage import repo


# --------------------------------------------------------------------------- #
# Design-failure checks
# --------------------------------------------------------------------------- #
def test_findings_carry_fix_suggestions():
    spec = parser.parse_text("Constitutive GFP expression")
    result = validate.validate(spec, assembler.assemble(spec))
    leaky = [f for f in result.findings if f.code == "leaky_expression"]
    assert leaky and leaky[0].fix_suggestion


def test_cross_reactivity_flagged_for_toggle_switch():
    # The toggle switch puts cI and cI434 (a weak cross-reactive pair) in one circuit.
    spec = parser.parse_text("Toggle switch with GFP")
    result = validate.validate(spec, assembler.assemble(spec))
    assert any(f.code == "cross_reactivity" for f in result.findings)


def test_rbs_strength_mismatch_check():
    # Custom weak promoter + very strong RBS in one TU should trip check #7.
    repo.create_part({"id": "pWeakTest", "name": "weak promoter", "type": "promoter",
                      "role": "constitutive", "kinetic_parameters": {"max_expression": 0.1, "basal_expression": 0.0}})
    repo.create_part({"id": "rbsStrongTest", "name": "strong RBS", "type": "rbs",
                      "kinetic_parameters": {"translation_efficiency": 5.0}})
    circuit = Circuit(
        nodes=[CircuitNode(id="GFP", type="cds", label="GFP", reporter=True)],
        edges=[],
        transcription_units=[TranscriptionUnit(
            name="mismatch", parts=["pWeakTest", "rbsStrongTest", "GFP", "B0015"])],
    )
    spec = parser.parse_text("Constitutive GFP expression")
    result = validate.validate(spec, circuit)
    rbs = [f for f in result.findings if f.code == "rbs_strength_mismatch"]
    assert rbs and rbs[0].fix_suggestion


# --------------------------------------------------------------------------- #
# Sensitivity analysis
# --------------------------------------------------------------------------- #
def test_sensitivity_ranks_parameters():
    spec = parser.parse_text("Express GFP when IPTG is present")
    sens = ode.sensitivity_analysis(spec)
    assert sens["baseline_peak"] > 0
    assert len(sens["rows"]) >= 3
    # rows are sorted by impact descending
    impacts = [r["impact_pct"] for r in sens["rows"]]
    assert impacts == sorted(impacts, reverse=True)
    # beta_p (max production) should be among the most influential
    assert sens["rows"][0]["parameter"] in {"beta_p", "k", "n"}


def test_duration_override_changes_t_end():
    spec = parser.parse_text("Express GFP when IPTG is present")
    sim = ode.simulate(spec, ode.SimParams(duration=75))
    assert sim.t[-1] == 75.0


# --------------------------------------------------------------------------- #
# Simulation history persistence
# --------------------------------------------------------------------------- #
def test_simulation_run_roundtrip():
    saved = repo.save_simulation_run(
        label="test run", mode="ode", organism="ecoli",
        params={"beta_p": 12.0}, summary={"peak": 50.0},
    )
    assert saved["id"]
    fetched = repo.get_simulation_run(saved["id"])
    assert fetched["label"] == "test run"
    assert fetched["summary"]["peak"] == 50.0
    assert any(r["id"] == saved["id"] for r in repo.list_simulation_runs())
