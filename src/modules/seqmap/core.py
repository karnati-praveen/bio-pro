"""Plasmid map layout engine — pure Python, no extra dependencies.

Given a sequence source (FASTA/GenBank text or a compiled circuit JSON),
produces a complete layout model consumed by PlasmidMap.jsx.
"""

from __future__ import annotations

import re
from typing import Optional

from modules.sequence.core import (
    _clean,
    parse_sequence,
    restriction_sites,
)

# ── Feature type → colour (kept in sync with SequenceEditor.jsx palette) ───── #
FEATURE_COLORS: dict[str, str] = {
    "promoter":      "#4895ef",
    "CDS":           "#2a9d8f",
    "cds":           "#2a9d8f",
    "gene":          "#2a9d8f",
    "RBS":           "#ffd166",
    "rbs":           "#ffd166",
    "terminator":    "#e63946",
    "rep_origin":    "#fb8500",
    "origin":        "#fb8500",
    "operator":      "#9d4edd",
    "regulatory":    "#4cc9f0",
    "mRNA":          "#52b788",
    "tRNA":          "#52b788",
    "primer_bind":   "#f77f00",
    "enhancer":      "#7209b7",
    "LTR":           "#b5838d",
    "repeat_region": "#adb5bd",
    "misc_feature":  "#9aa5b1",
}
_DEFAULT_COLOR = "#9aa5b1"

# BioBrick flanking sequences — same as records.py
_BB_PREFIX = "GAATTCGCGGCCGCTTCTAGA"
_BB_SUFFIX = "TACTAGTAGCGGCCGCTGCAG"
_PLACEHOLDER = "N" * 20


def _color(ftype: str) -> str:
    return FEATURE_COLORS.get(ftype, _DEFAULT_COLOR)


def _single_cutters(seq: str) -> set[str]:
    """Return enzyme names that cut the sequence exactly once."""
    counts: dict[str, int] = {}
    for s in restriction_sites(seq):
        counts[s["enzyme"]] = counts.get(s["enzyme"], 0) + 1
    return {name for name, c in counts.items() if c == 1}


def _gc_windows(seq: str) -> list[dict]:
    n = len(seq)
    if n == 0:
        return []
    # window size: ~1% of sequence, clamped to [20, 200]
    w = max(20, min(200, n // 100 or 30))
    step = max(1, w // 2)
    windows: list[dict] = []
    for i in range(0, n - w + 1, step):
        sub = seq[i: i + w]
        gc = (sub.count("G") + sub.count("C")) / len(sub) * 100
        windows.append({"start": i, "end": i + w, "gc": round(gc, 1)})
    return windows


def _sequence_from_circuit(compile_result: dict) -> dict:
    """Build a flat sequence + feature list from a CompileResponse JSON dict."""
    from modules.parts import library as lib

    circuit = compile_result.get("circuit") or {}
    tus = circuit.get("transcription_units") or []

    full_seq = ""
    features: list[dict] = []

    for tu in tus:
        tu_seq = _BB_PREFIX
        for part_id in (tu.get("parts") or []):
            part = lib.get_part(part_id) or {}
            ptype = part.get("type", "misc_feature")
            pname = part.get("name") or part_id
            pseq = part.get("seq") or _PLACEHOLDER
            feat_start = len(full_seq) + len(tu_seq)
            features.append({
                "start":  feat_start,
                "end":    feat_start + len(pseq),
                "strand": 1,
                "type":   ptype,
                "label":  pname,
                "color":  None,
            })
            tu_seq += pseq
        tu_seq += _BB_SUFFIX
        full_seq += tu_seq

    spec = compile_result.get("spec") or {}
    return {
        "name":     spec.get("output") or "circuit",
        "sequence": full_seq,
        "features": features,
        "topology": "linear",
        "length":   len(full_seq),
    }


def render_layout(
    filename: str = "sequence",
    content: str = "",
    extra_features: Optional[list[dict]] = None,
    topology_override: Optional[str] = None,
    compile_result: Optional[dict] = None,
) -> dict:
    """Return layout JSON for the SVG circular/linear map renderer.

    Schema::

        {
          name:              str,
          length:            int,
          topology:          "circular" | "linear",
          sequence:          str,
          features:          [{ start, end, strand, type, label, color }],
          restriction_sites: [{ enzyme, position, single_cutter }],
          gc_windows:        [{ start, end, gc }],
          origin:            int | None,
        }
    """
    # ── Resolve source ────────────────────────────────────────────────────── #
    if compile_result:
        parsed = _sequence_from_circuit(compile_result)
    else:
        parsed = parse_sequence(filename, content)

    seq = _clean(parsed.get("sequence", ""))
    name = parsed.get("name") or filename.rsplit("/", 1)[-1]
    topology = topology_override or parsed.get("topology", "linear")

    # Merge features (parsed + extra)
    raw_features = list(parsed.get("features") or [])
    for f in (extra_features or []):
        raw_features.append(f)

    features: list[dict] = []
    for f in raw_features:
        features.append({
            "start":  int(f.get("start", 0)),
            "end":    int(f.get("end", 0)),
            "strand": int(f.get("strand", 1)),
            "type":   f.get("type", "misc_feature"),
            "label":  f.get("label") or f.get("type") or "feature",
            "color":  f.get("color") or _color(f.get("type", "")),
        })

    # ── Restriction sites ─────────────────────────────────────────────────── #
    singles = _single_cutters(seq) if seq else set()
    site_list = [
        {
            "enzyme":        s["enzyme"],
            "position":      s["position"],
            "single_cutter": s["enzyme"] in singles,
        }
        for s in (restriction_sites(seq) if seq else [])
    ]

    # ── GC windows ───────────────────────────────────────────────────────── #
    gc_windows = _gc_windows(seq)

    # ── Origin detection ─────────────────────────────────────────────────── #
    origin: Optional[int] = None
    for f in features:
        if f["type"] in ("rep_origin", "origin"):
            origin = f["start"]
            break

    return {
        "name":              name,
        "length":            len(seq),
        "topology":          topology,
        "sequence":          seq,
        "features":          features,
        "restriction_sites": site_list,
        "gc_windows":        gc_windows,
        "origin":            origin,
    }
