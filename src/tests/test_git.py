"""Tests for Module 9 — git integration: bio_diff and suggest_commit_message."""

import json

import pytest

from modules.git.bio_diff import (
    bio_diff,
    circuit_diff,
    sequence_diff,
    suggest_commit_message,
    text_diff,
)


# --------------------------------------------------------------------------- #
# sequence_diff
# --------------------------------------------------------------------------- #

FASTA_OLD = ">seq1\nATGGCTAGCAAA\n"
FASTA_NEW = ">seq1\nATGGCTAGCAAAAGGAGA\n"  # 6 bp inserted


def test_sequence_diff_insertion():
    d = sequence_diff(FASTA_OLD, FASTA_NEW)
    assert d["kind"] == "sequence"
    assert d["net"] == 6
    ins_hunks = [h for h in d["hunks"] if h["type"] == "ins"]
    assert ins_hunks, "Should have at least one insertion hunk"


def test_sequence_diff_deletion():
    d = sequence_diff(FASTA_NEW, FASTA_OLD)
    assert d["net"] == -6
    del_hunks = [h for h in d["hunks"] if h["type"] == "del"]
    assert del_hunks


def test_sequence_diff_identical():
    d = sequence_diff(FASTA_OLD, FASTA_OLD)
    assert d["net"] == 0
    assert d["hunks"] == []


def test_sequence_diff_empty_old():
    d = sequence_diff("", FASTA_OLD)
    assert d["net"] > 0


# --------------------------------------------------------------------------- #
# circuit_diff
# --------------------------------------------------------------------------- #

_CIRCUIT = {
    "circuit": {
        "transcription_units": [
            {"name": "TU1", "parts": ["pLac", "RBS1", "GFP", "term1"]}
        ],
        "nodes": [],
        "edges": [],
    }
}

_CIRCUIT_NEW = {
    "circuit": {
        "transcription_units": [
            {"name": "TU1", "parts": ["pTet", "RBS1", "GFP", "term1", "RFP"]}
        ],
        "nodes": [],
        "edges": [],
    }
}


def test_circuit_diff_added_removed():
    old = json.dumps(_CIRCUIT)
    new = json.dumps(_CIRCUIT_NEW)
    d = circuit_diff(old, new)
    assert d["kind"] == "circuit"
    assert "RFP" in d["added"]
    assert "pTet" in d["added"]
    assert "pLac" in d["removed"]
    assert "GFP" in d["unchanged"]


def test_circuit_diff_identical():
    old = json.dumps(_CIRCUIT)
    d = circuit_diff(old, old)
    assert d["added"] == []
    assert d["removed"] == []


# --------------------------------------------------------------------------- #
# text_diff
# --------------------------------------------------------------------------- #

def test_text_diff_basic():
    d = text_diff("line1\nline2\n", "line1\nline3\n")
    assert d["kind"] == "text"
    assert any("line3" in h for h in d["hunks"])
    assert any("line2" in h for h in d["hunks"])


def test_text_diff_identical():
    d = text_diff("same\n", "same\n")
    assert d["hunks"] == []


# --------------------------------------------------------------------------- #
# bio_diff dispatch
# --------------------------------------------------------------------------- #

def test_bio_diff_routes_by_extension():
    fa = bio_diff("seq.fasta", FASTA_OLD, FASTA_NEW)
    assert fa["kind"] == "sequence"

    txt = bio_diff("notes.txt", "hello\n", "world\n")
    assert txt["kind"] == "text"

    bp = bio_diff("design.biopro", json.dumps(_CIRCUIT), json.dumps(_CIRCUIT_NEW))
    assert bp["kind"] == "circuit"


# --------------------------------------------------------------------------- #
# suggest_commit_message
# --------------------------------------------------------------------------- #

def test_suggest_insertion_message():
    d = sequence_diff(FASTA_OLD, FASTA_NEW)
    msg = suggest_commit_message([d], "MyDesign")
    assert "MyDesign" in msg or "Inserted" in msg


def test_suggest_circuit_message():
    old = json.dumps(_CIRCUIT)
    new = json.dumps(_CIRCUIT_NEW)
    d = circuit_diff(old, new)
    msg = suggest_commit_message([d], "Sensor")
    assert msg  # non-empty
    assert any(kw in msg for kw in ("Added", "Removed", "Update"))


def test_suggest_empty_diffs():
    msg = suggest_commit_message([], "")
    assert isinstance(msg, str)
