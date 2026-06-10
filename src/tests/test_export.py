"""Tests for the export stage (GenBank / FASTA / SBOL / JSON bundle).

Exports round-trip through their parsers, so a malformed record fails loudly. Run
without network or API keys.
"""

import io
import json

import pytest
from Bio import SeqIO

from modules import export
from modules.compiler import assembler, parser, validate
from shared.schemas.schemas import CompileResponse
from modules.simulation import ode


def _response(text: str) -> CompileResponse:
    spec = parser.parse_text(text)
    circuit = assembler.assemble(spec)
    return CompileResponse(
        spec=spec,
        circuit=circuit,
        validation=validate.validate(spec, circuit),
        simulation=ode.simulate(spec),
        trace=[*spec.trace, *circuit.trace],
    )


def test_genbank_roundtrips():
    resp = _response("Express GFP when IPTG is present")
    text, media, suffix = export.export(resp, "genbank")
    assert suffix == "gb"
    records = list(SeqIO.parse(io.StringIO(text), "genbank"))
    assert len(records) == len(resp.circuit.transcription_units)
    # each TU annotates promoter/RBS/CDS/terminator features
    assert all(len(r.features) >= 4 for r in records)


def test_fasta_roundtrips_with_real_sequences():
    resp = _response("Express GFP when IPTG is present")
    text, _, suffix = export.export(resp, "fasta")
    assert suffix == "fasta"
    records = list(SeqIO.parse(io.StringIO(text), "fasta"))
    assert records and all(len(r.seq) > 0 for r in records)


def test_json_bundle_is_self_contained():
    resp = _response("Express GFP when IPTG is present")
    text, media, suffix = export.export(resp, "json")
    assert media == "application/json"
    payload = json.loads(text)
    assert {"spec", "circuit", "validation", "simulation"} <= payload.keys()


def test_sbol_writes_rdf():
    resp = _response("Express GFP when IPTG is present")
    text, media, _ = export.export(resp, "sbol")
    assert media == "application/rdf+xml"
    assert "RDF" in text and "Component" in text


def test_logic_gate_exports_despite_synthetic_promoter():
    resp = _response("Express GFP when IPTG and arabinose are present")
    # pAND has no sequence; GenBank/FASTA must still build from the real parts.
    records = list(SeqIO.parse(io.StringIO(export.export(resp, "genbank")[0]), "genbank"))
    assert len(records) == 3  # two regulator cassettes + output


def test_unknown_format_raises():
    resp = _response("Express GFP when IPTG is present")
    with pytest.raises(ValueError):
        export.export(resp, "docx")


# ---------------------------------------------------------------------------
# Helper: collect all feature /label qualifier values across a list of records
# ---------------------------------------------------------------------------
def _feature_labels(records) -> set[str]:
    return {
        lbl
        for rec in records
        for feat in rec.features
        for lbl in feat.qualifiers.get("label", [])
    }


# ---------------------------------------------------------------------------
# Parametrized: every complex circuit produces valid, complete GenBank output
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("text,expected_pattern,expected_tus", [
    ("Express GFP when IPTG and arabinose are present", "logic_and", 3),
    ("NAND gate GFP with IPTG and arabinose",           "logic_nand", 3),
    ("Repressilator with GFP reporter",                 "oscillator", 4),
    ("Toggle switch with GFP output",                   "toggle_switch", 3),
])
def test_complex_circuit_genbank_complete(text, expected_pattern, expected_tus):
    resp = _response(text)
    assert resp.spec.pattern == expected_pattern

    gb_text, _, suffix = export.export(resp, "genbank")
    assert suffix == "gb"
    assert gb_text  # non-empty

    records = list(SeqIO.parse(io.StringIO(gb_text), "genbank"))
    assert len(records) == expected_tus
    assert all(len(r.seq) > 0 for r in records)

    labels = _feature_labels(records)
    for tu in resp.circuit.transcription_units:
        for part_id in tu.parts:
            assert part_id in labels, (
                f"Part {part_id!r} from TU {tu.name!r} missing from GenBank features"
            )


# ---------------------------------------------------------------------------
# Parametrized: every complex circuit produces valid, complete FASTA output
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("text,expected_tus", [
    ("Express GFP when IPTG and arabinose are present", 3),
    ("NAND gate GFP with IPTG and arabinose",           3),
    ("Repressilator with GFP reporter",                 4),
    ("Toggle switch with GFP output",                   3),
])
def test_complex_circuit_fasta_complete(text, expected_tus):
    resp = _response(text)
    fa_text, _, suffix = export.export(resp, "fasta")
    assert suffix == "fasta"
    assert fa_text

    records = list(SeqIO.parse(io.StringIO(fa_text), "fasta"))
    assert len(records) == expected_tus
    assert all(len(r.seq) > 0 for r in records)


# ---------------------------------------------------------------------------
# logic_and specifically: verify pAND gets a documented placeholder (not dropped)
# ---------------------------------------------------------------------------
def test_logic_and_placeholder_documented_in_genbank():
    resp = _response("Express GFP when IPTG and arabinose are present")
    gb_text, _, _ = export.export(resp, "genbank")

    # The note text must name the placeholder so readers know Ns are intentional.
    assert "SYNTHETIC_PLACEHOLDER" in gb_text

    records = list(SeqIO.parse(io.StringIO(gb_text), "genbank"))
    # Output TU (last record) uses pAND — its sequence must contain Ns.
    output_rec = records[-1]
    assert "N" in str(output_rec.seq).upper(), (
        "Expected poly-N placeholder in logic_and output TU sequence"
    )
    # The record-level COMMENT should warn about the substitution.
    assert output_rec.annotations.get("comment"), (
        "Expected COMMENT annotation on record with placeholder parts"
    )


# ---------------------------------------------------------------------------
# logic_and: SBOL still emits a well-formed Component for the synthetic pAND
# ---------------------------------------------------------------------------
def test_logic_and_sbol_synthetic_part_annotated():
    resp = _response("Express GFP when IPTG and arabinose are present")
    sbol_text, media, _ = export.export(resp, "sbol")
    assert media == "application/rdf+xml"
    assert "SYNTHETIC_PLACEHOLDER" in sbol_text
