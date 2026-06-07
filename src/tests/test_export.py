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
