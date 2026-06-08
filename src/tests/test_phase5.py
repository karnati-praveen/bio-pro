"""Phase 5 tests: primer design, protocol generation, FBA, experiment tracker."""

import pytest

from modules.compiler import assembler, parser
from modules import primers, pathway, protocol
from shared.db import repo
from shared.db.db import init_db
from shared.schemas.schemas import CompileResponse, ValidationResult, Simulation


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


def _compile(text="Express GFP when IPTG is present") -> CompileResponse:
    spec = parser.parse_text(text)
    circuit = assembler.assemble(spec)
    return CompileResponse(
        spec=spec, circuit=circuit,
        validation=ValidationResult(ok=True, findings=[]),
        simulation=Simulation(t=[0.0], series=[]), trace=[],
    )


# --------------------------------------------------------------------------- #
# Primer design
# --------------------------------------------------------------------------- #
def test_nn_tm_reasonable():
    tm = primers.nn_tm("GCGCGCGCGCGCGCGCGCGC")  # all GC → high Tm
    assert tm > 60
    at = primers.nn_tm("ATATATATATATATATATAT")  # all AT → low Tm
    assert at < tm


def test_design_primers_returns_pair():
    seq = "ATGGCTAGCAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTT"
    pair = primers.design_primers(seq, target_tm=58)
    assert len(pair) == 2
    assert pair[0]["name"] == "Forward" and pair[1]["name"] == "Reverse"
    assert all(18 <= p["length"] <= 25 for p in pair)
    assert all("amplicon_size" in p for p in pair)


def test_design_primers_short_sequence_raises():
    with pytest.raises(ValueError):
        primers.design_primers("ATGC", target_tm=60)


# --------------------------------------------------------------------------- #
# Protocol generation
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("method", ["gibson", "golden_gate", "biobrick"])
def test_build_protocol_methods(method):
    proto = protocol.build_protocol(_compile(), method)
    assert proto.method == method
    assert proto.steps
    assert proto.materials and proto.est_cost_usd > 0
    assert proto.est_time_min and proto.est_time_min > 0


def test_gibson_protocol_designs_primers():
    proto = protocol.build_protocol(_compile(), "gibson")
    assert proto.primers  # Gibson fragments get PCR primers
    assert all("tm" in p for p in proto.primers)


def test_biobrick_has_no_primers_but_restriction_steps():
    proto = protocol.build_protocol(_compile(), "biobrick")
    assert proto.primers == []
    assert any("EcoRI" in s for s in proto.steps)


# --------------------------------------------------------------------------- #
# Flux Balance Analysis
# --------------------------------------------------------------------------- #
def test_fba_glycolysis_template():
    tpl = pathway.get_template("upper_glycolysis")
    res = pathway.run_fba(tpl["metabolites"], tpl["reactions"], tpl["objective"])
    assert res["status"] == "optimal"
    # glucose uptake bounded at 10 → 2 pyruvate each → objective 20
    assert res["objective_value"] == pytest.approx(20.0, abs=0.1)
    assert "GLC_uptake" in res["bottlenecks"]


def test_fba_unknown_objective_raises():
    with pytest.raises(ValueError):
        pathway.run_fba(["A"], [{"id": "r1", "stoich": {"A": 1}, "lb": 0, "ub": 5}], "missing")


def test_fba_templates_listed():
    ids = [t["id"] for t in pathway.list_templates()]
    assert "upper_glycolysis" in ids


# --------------------------------------------------------------------------- #
# Experiment tracker
# --------------------------------------------------------------------------- #
def test_experiment_crud_roundtrip():
    created = repo.create_experiment({
        "title": "GFP expression test", "exp_type": "expression",
        "columns": ["Colony", "GFP", "OD600"], "rows": [["c1", 1200, 0.6]],
        "notes_md": "Induced with 1 mM IPTG.",
    })
    eid = created["id"]
    assert created["columns"] == ["Colony", "GFP", "OD600"]

    updated = repo.update_experiment(eid, {"rows": [["c1", 1200, 0.6], ["c2", 1800, 0.7]]})
    assert len(updated["rows"]) == 2

    assert repo.get_experiment(eid)["title"] == "GFP expression test"
    assert any(e["id"] == eid for e in repo.list_experiments())
    assert repo.delete_experiment(eid) is True
    assert repo.get_experiment(eid) is None
