"""Tests for the seqmap plasmid-map layout engine.

Covers feature placement from GenBank files, single-cutter detection,
GC window generation, origin detection, and colour assignment.
"""

import pytest

from modules.seqmap.core import (
    FEATURE_COLORS,
    _gc_windows,
    _single_cutters,
    render_layout,
)
from modules.sequence.core import ENZYMES


# ── Helpers ───────────────────────────────────────────────────────────────── #

def _minimal_gb(features_block: str, seq: str, topology: str = "circular") -> str:
    return (
        f"LOCUS      TEST   {len(seq)} bp    DNA     {topology}\n"
        "FEATURES             Location/Qualifiers\n"
        f"{features_block}"
        "ORIGIN\n"
        f"        1 {seq}\n"
        "//\n"
    )


# ── Single-cutter detection ───────────────────────────────────────────────── #

def test_single_cutter_present_once():
    seq = "AAAA" + "GAATTC" + "TTTT" * 30  # one EcoRI site
    singles = _single_cutters(seq)
    assert "EcoRI" in singles


def test_single_cutter_excluded_when_twice():
    seq = "GAATTC" + "CCCC" * 10 + "GAATTC"  # two EcoRI sites
    singles = _single_cutters(seq)
    assert "EcoRI" not in singles


def test_absent_enzyme_not_in_singles():
    seq = "GAATTC" + "A" * 50  # no BamHI
    singles = _single_cutters(seq)
    assert "BamHI" not in singles


# ── Feature placement from GenBank ────────────────────────────────────────── #

def test_forward_feature_coordinates():
    features_block = (
        '     promoter        1..30\n'
        '                     /label="pTac"\n'
    )
    gb = _minimal_gb(features_block, "a" * 100)
    layout = render_layout("test.gb", gb)
    feats = {f["label"]: f for f in layout["features"]}
    assert "pTac" in feats
    assert feats["pTac"]["start"] == 0     # GenBank 1-based → 0-based
    assert feats["pTac"]["end"]   == 30
    assert feats["pTac"]["strand"] == 1


def test_complement_feature_strand():
    features_block = (
        '     CDS             complement(40..80)\n'
        '                     /label="GFP"\n'
    )
    gb = _minimal_gb(features_block, "a" * 100)
    layout = render_layout("test.gb", gb)
    feats = {f["label"]: f for f in layout["features"]}
    assert feats["GFP"]["strand"] == -1


def test_topology_preserved():
    gb = _minimal_gb("", "a" * 50, topology="circular")
    layout = render_layout("p.gb", gb)
    assert layout["topology"] == "circular"

    gb_lin = _minimal_gb("", "a" * 50, topology="linear")
    layout_lin = render_layout("p.gb", gb_lin)
    assert layout_lin["topology"] == "linear"


def test_topology_override():
    gb = _minimal_gb("", "a" * 50, topology="linear")
    layout = render_layout("p.gb", gb, topology_override="circular")
    assert layout["topology"] == "circular"


# ── GC windows ───────────────────────────────────────────────────────────── #

def test_gc_windows_nonempty_sequence():
    layout = render_layout("seq.fasta", ">t\n" + "GCGCGC" * 20)
    assert len(layout["gc_windows"]) > 0


def test_gc_windows_values_in_range():
    layout = render_layout("seq.fasta", ">t\n" + "ATATATAT" * 25)
    for w in layout["gc_windows"]:
        assert 0 <= w["gc"] <= 100


def test_gc_windows_empty_sequence():
    layout = render_layout("seq.fasta", ">empty\n")
    assert layout["gc_windows"] == []


def test_gc_window_fields():
    layout = render_layout("seq.fasta", ">t\n" + "AAAA" * 50)
    for w in layout["gc_windows"]:
        assert "start" in w and "end" in w and "gc" in w
        assert w["start"] < w["end"]


# ── Restriction sites ─────────────────────────────────────────────────────── #

def test_single_cutter_flag_true():
    seq = "GAATTC" + "N" * 200
    layout = render_layout("seq.fasta", f">t\n{seq}")
    ecori = [s for s in layout["restriction_sites"] if s["enzyme"] == "EcoRI"]
    assert len(ecori) == 1
    assert ecori[0]["single_cutter"] is True


def test_multi_cutter_flag_false():
    seq = "GAATTC" + "A" * 20 + "GAATTC"
    layout = render_layout("seq.fasta", f">t\n{seq}")
    ecori = [s for s in layout["restriction_sites"] if s["enzyme"] == "EcoRI"]
    assert all(not s["single_cutter"] for s in ecori)


def test_site_position_correct():
    seq = "AAAA" + "GGATCC" + "TTTT"  # BamHI at offset 4
    layout = render_layout("seq.fasta", f">t\n{seq}")
    bamhi = [s for s in layout["restriction_sites"] if s["enzyme"] == "BamHI"]
    assert len(bamhi) == 1
    assert bamhi[0]["position"] == 4


# ── Origin detection ─────────────────────────────────────────────────────── #

def test_origin_from_rep_origin_feature():
    features_block = (
        '     rep_origin      1..60\n'
        '                     /label="pUC ori"\n'
    )
    gb = _minimal_gb(features_block, "a" * 200)
    layout = render_layout("plasmid.gb", gb)
    assert layout["origin"] == 0  # start=0 (1-based 1 → 0-based 0)


def test_origin_none_when_absent():
    layout = render_layout("seq.fasta", ">t\n" + "ATCGATCG" * 20)
    assert layout["origin"] is None


# ── Colour assignment ─────────────────────────────────────────────────────── #

def test_known_feature_type_gets_color():
    features_block = (
        '     promoter        1..25\n'
        '                     /label="pBAD"\n'
    )
    gb = _minimal_gb(features_block, "a" * 100)
    layout = render_layout("test.gb", gb)
    feat = layout["features"][0]
    assert feat["color"] == FEATURE_COLORS["promoter"]


def test_unknown_feature_type_gets_default_color():
    features_block = (
        '     unknown_type    1..25\n'
        '                     /label="mystery"\n'
    )
    gb = _minimal_gb(features_block, "a" * 100)
    layout = render_layout("test.gb", gb)
    feat = layout["features"][0]
    assert feat["color"].startswith("#")


def test_extra_features_merged():
    extra = [{"start": 5, "end": 20, "strand": 1, "type": "RBS", "label": "B0032"}]
    layout = render_layout("seq.fasta", ">t\n" + "A" * 50, extra_features=extra)
    labels = [f["label"] for f in layout["features"]]
    assert "B0032" in labels


# ── FASTA / plain text sources ────────────────────────────────────────────── #

def test_fasta_parse_length():
    seq = "ATCG" * 25
    layout = render_layout("seq.fasta", f">myseq\n{seq}")
    assert layout["length"] == len(seq)
    assert layout["name"] == "myseq"


def test_plain_sequence_parse():
    seq = "ATCGATCG" * 10
    layout = render_layout("seq.txt", seq)
    assert layout["length"] == len(seq)
