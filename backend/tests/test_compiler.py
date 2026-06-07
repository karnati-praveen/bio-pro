"""Tests for the rule-based compiler and ODE — gates, parsing, and tunable params.

The compiler is deterministic and LLM-free, so these are exact behavioural checks.
Run from the backend dir with: python -m pytest
"""

import pytest

from compiler import assembler, parser, validate
from compiler.parser import ParseError
from models.schemas import FormInput, SimParams
from simulation import ode


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def test_parse_single_inducer_text():
    spec = parser.parse_text("Express GFP when IPTG is present")
    assert spec.output == "GFP"
    assert spec.pattern == "inducible_expression"
    assert len(spec.triggers) == 1
    assert spec.trigger.inducer == "IPTG"
    assert spec.trigger.presence == "present"


def test_parse_absence_sets_presence_absent():
    spec = parser.parse_text("Express GFP in the absence of aTc")
    assert spec.trigger.presence == "absent"
    assert spec.pattern == "inducible_expression"


def test_parse_and_gate_text():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    assert spec.pattern == "logic_and"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "arabinose"]


def test_parse_or_gate_text():
    spec = parser.parse_text("Express RFP when aTc or IPTG is present")
    assert spec.pattern == "logic_or"
    assert {t.inducer for t in spec.triggers} == {"aTc", "IPTG"}


def test_two_inducers_without_connective_is_single_input():
    # No 'and'/'or' connective -> falls back to single-input on the first inducer.
    spec = parser.parse_text("Express GFP with IPTG, arabinose")
    assert spec.pattern == "inducible_expression"
    assert spec.trigger.inducer == "IPTG"


def test_parse_unknown_reporter_raises():
    with pytest.raises(ParseError):
        parser.parse_text("Express unicorn when IPTG is present")


def test_parse_form_gate():
    spec = parser.parse_form(
        FormInput(output="GFP", inducer="IPTG", inducer2="arabinose", gate="and")
    )
    assert spec.pattern == "logic_and"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "arabinose"]


def test_parse_form_gate_requires_distinct_inducers():
    with pytest.raises(ParseError):
        parser.parse_form(
            FormInput(output="GFP", inducer="IPTG", inducer2="IPTG", gate="or")
        )


def test_parse_nand_gate_text():
    spec = parser.parse_text("Express GFP when IPTG NAND aTc")
    assert spec.pattern == "logic_nand"
    assert {t.inducer for t in spec.triggers} == {"IPTG", "aTc"}


def test_parse_nor_gate_text():
    spec = parser.parse_text("Express RFP when IPTG NOR arabinose")
    assert spec.pattern == "logic_nor"
    assert {t.inducer for t in spec.triggers} == {"IPTG", "arabinose"}


def test_parse_combinatorial_keeps_all_inducers():
    spec = parser.parse_text("Combinatorial logic GFP with IPTG and aTc and arabinose")
    assert spec.pattern == "combinatorial_logic"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "aTc", "arabinose"]


def test_inverted_gate_requires_two_inducers():
    with pytest.raises(ParseError):
        parser.parse_text("Express GFP when IPTG NAND")


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #
def test_assemble_single_input_has_reporter_and_units():
    spec = parser.parse_text("Express GFP when IPTG is present")
    circuit = assembler.assemble(spec)
    assert any(n.reporter for n in circuit.nodes)
    assert len(circuit.transcription_units) == 2
    # promoter -> output expression edge exists
    assert any(e.target == "GFP" and e.kind == "expression" for e in circuit.edges)


def test_assemble_and_gate_has_logic_node_and_two_branches():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    circuit = assembler.assemble(spec)
    logic_nodes = [n for n in circuit.nodes if n.type == "logic"]
    assert len(logic_nodes) == 1
    assert logic_nodes[0].label.startswith("AND")
    # both input promoters drive the gate
    gate_inputs = [e for e in circuit.edges if e.target == "GATE"]
    assert len(gate_inputs) == 2
    # gate drives the reporter
    assert any(e.source == "GATE" and e.target == "GFP" for e in circuit.edges)
    # shared constitutive promoter node is not duplicated
    ids = [n.id for n in circuit.nodes]
    assert len(ids) == len(set(ids))
    # three transcription units: two regulator cassettes + output
    assert len(circuit.transcription_units) == 3


def test_assemble_nand_gate_inverts_via_internal_repressor():
    spec = parser.parse_text("Express GFP when IPTG NAND aTc")
    circuit = assembler.assemble(spec)
    # inverter node present, repressing the reporter
    assert any(n.id == "INV" for n in circuit.nodes)
    assert any(e.source == "INV" and e.target == "GFP" and e.kind == "repression"
               for e in circuit.edges)
    result = validate.validate(spec, circuit)
    assert result.ok


def test_assemble_combinatorial_has_three_branches():
    spec = parser.parse_text("Combinatorial logic GFP with IPTG and aTc and arabinose")
    circuit = assembler.assemble(spec)
    gate_inputs = [e for e in circuit.edges if e.target == "GATE"]
    assert len(gate_inputs) == 3
    assert validate.validate(spec, circuit).ok


# --------------------------------------------------------------------------- #
# Simulation
# --------------------------------------------------------------------------- #
def _reporter_series(sim):
    return next(s for s in sim.series if s.is_reporter)


def test_simulate_single_input_rises_after_induction():
    spec = parser.parse_text("Express GFP when IPTG is present")
    sim = ode.simulate(spec)
    rep = _reporter_series(sim)
    assert rep.values[0] < 1.0           # basal/off at the start
    assert rep.values[-1] > rep.values[0]  # induced/on by the end


def test_simulate_absent_inducer_stays_near_basal():
    # No inducer -> the reporter sits near its (leaky) basal level and the induced
    # case ends much higher. Repression is tight but not infinite, so basal > 0.
    absent = _reporter_series(ode.simulate(parser.parse_text("Express GFP without IPTG")))
    present = _reporter_series(
        ode.simulate(parser.parse_text("Express GFP when IPTG is present"))
    )
    assert present.values[-1] > 5 * absent.values[-1]


def test_and_gate_lower_than_or_gate_midrun():
    # With staggered inputs, at the point where only the FIRST input is on,
    # OR should already be expressing while AND is still off.
    and_spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    or_spec = parser.parse_text("Express GFP when IPTG or arabinose are present")
    and_sim = ode.simulate(and_spec)
    or_sim = ode.simulate(or_spec)
    # index ~ T/3 (first input on at T/4, second at T/2)
    i = len(and_sim.t) // 3
    and_val = _reporter_series(and_sim).values[i]
    or_val = _reporter_series(or_sim).values[i]
    assert or_val > and_val


def test_and_gate_full_expression_at_end():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    sim = ode.simulate(spec)
    rep = _reporter_series(sim)
    # both inputs on by the end -> output expressed
    assert rep.values[-1] > rep.values[0]
    # 1 reporter + 2 regulators + 2 inducer inputs = 5 series
    assert len(sim.series) == 5


def test_nor_lower_than_or_at_end():
    # With both inputs on by the end, OR is high and NOR is low (inverse).
    or_sim = ode.simulate(parser.parse_text("Express GFP when IPTG or aTc are present"))
    nor_sim = ode.simulate(parser.parse_text("Express GFP when IPTG NOR aTc"))
    assert _reporter_series(or_sim).values[-1] > _reporter_series(nor_sim).values[-1]


def test_tunable_params_scale_output():
    spec = parser.parse_text("Express GFP when IPTG is present")
    base = _reporter_series(ode.simulate(spec))
    boosted = _reporter_series(
        ode.simulate(spec, SimParams(beta_p=40.0))
    )
    assert boosted.values[-1] > base.values[-1]


# --------------------------------------------------------------------------- #
# Validation (design-rule checks)
# --------------------------------------------------------------------------- #
def test_validation_passes_for_well_formed_circuit():
    spec = parser.parse_text("Express GFP when IPTG is present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok
    assert all(f.severity != "error" for f in result.findings)


def test_validation_flags_reporter_part_reuse_as_info():
    # The default terminator is reused across both cassettes -> info finding.
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok  # info/warnings do not fail the build
    assert any(f.code == "repeated_part" for f in result.findings)


def test_validation_flags_missing_terminator():
    from models.schemas import Circuit, CircuitNode, TranscriptionUnit

    bad = Circuit(
        nodes=[CircuitNode(id="GFP", type="cds", label="GFP", reporter=True)],
        edges=[],
        transcription_units=[TranscriptionUnit(name="leaky", parts=["pLac", "B0034", "GFP"])],
    )
    spec = parser.parse_text("Express GFP when IPTG is present")
    result = validate.validate(spec, bad)
    assert any(f.code == "missing_terminator" for f in result.findings)
