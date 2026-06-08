"""Tests for Module 8 — cloning map data assembly."""

import pytest

from modules.compiler import assembler, parser
from modules.protocol import cloning_map as cm_mod
from modules.protocol.cloning_map import build_cloning_map
from modules import protocol as proto_mod
from shared.db.db import init_db
from shared.schemas.schemas import CompileResponse, ValidationResult, Simulation


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


def _compile(text: str = "Express GFP when IPTG is present") -> CompileResponse:
    spec = parser.parse_text(text)
    circuit = assembler.assemble(spec)
    return CompileResponse(
        spec=spec, circuit=circuit,
        validation=ValidationResult(ok=True, findings=[]),
        simulation=Simulation(t=[0.0], series=[]), trace=[],
    )


# --------------------------------------------------------------------------- #
# build_cloning_map
# --------------------------------------------------------------------------- #

def test_map_returns_required_keys():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto, topology="linear")
    for key in ("topology", "total_bp", "parts", "restriction_sites", "primer_sites"):
        assert key in data, f"Missing key: {key}"


def test_map_topology_linear():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto, topology="linear")
    assert data["topology"] == "linear"


def test_map_topology_circular():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto, topology="circular")
    assert data["topology"] == "circular"


def test_parts_have_required_fields():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto)
    for p in data["parts"]:
        assert "name" in p
        assert "bp" in p
        assert "start" in p
        assert "end" in p
        assert "color" in p
        assert p["end"] >= p["start"]


def test_total_bp_matches_parts():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto)
    if data["parts"]:
        last = data["parts"][-1]
        assert last["end"] == data["total_bp"]


def test_restriction_sites_structure():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto)
    for s in data["restriction_sites"]:
        assert "enzyme" in s
        assert "position" in s
        assert isinstance(s["position"], int)


def test_primer_sites_structure():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "gibson")
    data = build_cloning_map(resp, proto)
    for p in data["primer_sites"]:
        assert "name" in p
        assert "start" in p
        assert "end" in p
        assert "strand" in p


def test_golden_gate_map():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "golden_gate")
    data = build_cloning_map(resp, proto, topology="circular")
    assert data["topology"] == "circular"
    assert isinstance(data["parts"], list)


def test_biobrick_map():
    resp = _compile()
    proto = proto_mod.build_protocol(resp, "biobrick")
    data = build_cloning_map(resp, proto)
    assert isinstance(data["total_bp"], int)


# --------------------------------------------------------------------------- #
# Helper internals
# --------------------------------------------------------------------------- #

def test_default_color_cycles():
    for i in range(20):
        color = cm_mod._default_color(i)
        assert color.startswith("#")


def test_effective_seq_strips_overhangs():
    seq = "A" * 60
    effective_gibson = cm_mod._effective_seq(seq, "gibson")
    assert len(effective_gibson) == 20   # 60 - 40 bp overlap stripped

    effective_bb = cm_mod._effective_seq(seq, "biobrick")
    assert len(effective_bb) == 60       # no stripping for BioBrick


def test_revcomp():
    assert cm_mod._revcomp("ATGC") == "GCAT"
    assert cm_mod._revcomp("AAAA") == "TTTT"
