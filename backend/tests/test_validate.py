"""Tests for the design-rule validation stage.

A good circuit validates clean (no errors); each deliberately-broken invariant produces
the expected finding code. Validation never raises -- it returns structured findings.
"""

from compiler import assembler, parser, validate
from models.schemas import (
    Circuit,
    CircuitEdge,
    CircuitNode,
    IntentSpec,
    TranscriptionUnit,
    Trigger,
)


def _codes(result):
    return {f.code for f in result.findings}


def test_valid_single_input_has_no_errors():
    spec = parser.parse_text("Express GFP when IPTG is present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok
    assert not any(f.severity == "error" for f in result.findings)


def test_valid_and_gate_has_no_errors():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok
    # the synthetic logic promoter is reported as info, not an error
    assert "synthetic_promoter" in _codes(result)


def test_missing_reporter_is_error():
    spec = parser.parse_text("Express GFP when IPTG is present")
    circuit = assembler.assemble(spec)
    for n in circuit.nodes:
        n.reporter = False  # strip the reporter flag
    result = validate.validate(spec, circuit)
    assert not result.ok
    assert "no_reporter" in _codes(result)


def test_broken_tu_grammar_is_error():
    # A transcription unit missing its terminator violates promoter-RBS-CDS-terminator.
    circuit = Circuit(
        nodes=[
            CircuitNode(id="pCon", type="promoter", label="pCon", role="constitutive"),
            CircuitNode(id="LacI", type="cds", label="LacI", role="repressor"),
            CircuitNode(id="pLac", type="promoter", label="pLac", role="repressible"),
            CircuitNode(id="IPTG", type="inducer", label="IPTG", role="small_molecule"),
            CircuitNode(id="GFP", type="cds", label="GFP", role="reporter", reporter=True),
        ],
        edges=[
            CircuitEdge(source="pCon", target="LacI", kind="expression"),
            CircuitEdge(source="LacI", target="pLac", kind="repression"),
            CircuitEdge(source="IPTG", target="LacI", kind="inhibition"),
            CircuitEdge(source="pLac", target="GFP", kind="expression"),
        ],
        transcription_units=[
            TranscriptionUnit(name="GFP cassette", parts=["pLac", "B0034", "GFP"]),  # no terminator
        ],
    )
    spec = IntentSpec(
        output="GFP",
        triggers=[Trigger(inducer="IPTG", presence="present")],
        pattern="inducible_expression",
    )
    result = validate.validate(spec, circuit)
    assert not result.ok
    assert "tu_grammar" in _codes(result)


def test_dangling_edge_is_error():
    spec = parser.parse_text("Express GFP when IPTG is present")
    circuit = assembler.assemble(spec)
    circuit.edges.append(CircuitEdge(source="GFP", target="NOPE", kind="expression"))
    result = validate.validate(spec, circuit)
    assert not result.ok
    assert "dangling_edge" in _codes(result)


def test_induce_off_activator_is_warning():
    # Arabinose drives an activation system; requesting it 'absent' is a (valid but
    # unusual) induce-OFF design -> warning, not error.
    spec = IntentSpec(
        output="GFP",
        triggers=[Trigger(inducer="arabinose", presence="absent")],
        pattern="inducible_expression",
    )
    circuit = assembler.assemble(spec)
    result = validate.validate(spec, circuit)
    assert result.ok  # warning only
    assert "induce_off_activator" in _codes(result)
