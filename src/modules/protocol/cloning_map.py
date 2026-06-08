"""Cloning map data assembly for Module 8.

Builds a structured representation of the assembled construct that the frontend
renders as an SVG (linear or circular).  Reuses sequence.core.restriction_sites
and the fragments / primers already produced by build_protocol.
"""

from __future__ import annotations

import math
from modules.sequence.core import restriction_sites, ENZYMES
from shared.schemas.schemas import AssemblyProtocol, CompileResponse


def build_cloning_map(
    response: CompileResponse,
    protocol: AssemblyProtocol,
    topology: str = "linear",
) -> dict:
    """Return a structured cloning-map payload for the frontend renderer.

    Returned dict:
    {
        topology:  "linear" | "circular",
        total_bp:  int,
        parts: [
            {name, bp, start, end, color}
        ],
        restriction_sites: [
            {enzyme, position, cut_offset, strand}
        ],
        primer_sites: [
            {name, start, end, strand, tm}
        ],
    }
    """
    # ------------------------------------------------------------------
    # 1. Assemble the ordered fragment list with cumulative positions
    # ------------------------------------------------------------------
    parts: list[dict] = []
    assembled_seq = ""
    colors = _part_colors(response)

    for frag in protocol.fragments:
        seq = (frag.order_sequence or frag.sequence or "").upper()
        # Strip Gibson / Golden Gate overhangs (first/last 20 bp) for display length
        effective = _effective_seq(seq, protocol.method)
        start = len(assembled_seq)
        end = start + len(effective)
        parts.append({
            "name": frag.name,
            "bp": len(effective),
            "start": start,
            "end": end,
            "color": colors.get(frag.name, _default_color(len(parts))),
        })
        assembled_seq += effective

    total_bp = len(assembled_seq)

    # ------------------------------------------------------------------
    # 2. Restriction sites on the assembled sequence
    # ------------------------------------------------------------------
    rsites = []
    if assembled_seq:
        sites = restriction_sites(assembled_seq, list(ENZYMES.keys()))
        for site in sites:
            rsites.append({
                "enzyme": site["enzyme"],
                "position": site["position"],
                "cut_offset": site.get("cut_offset", 0),
                "strand": site.get("strand", 1),
            })

    # ------------------------------------------------------------------
    # 3. Primer binding sites (from designed primers in the protocol)
    # ------------------------------------------------------------------
    primer_sites: list[dict] = []
    if protocol.primers and assembled_seq:
        for p in protocol.primers:
            pseq = (p.get("sequence") or "").upper()
            if not pseq:
                continue
            # Forward match
            pos = assembled_seq.find(pseq)
            if pos >= 0:
                primer_sites.append({
                    "name": p.get("name", ""),
                    "start": pos,
                    "end": pos + len(pseq),
                    "strand": 1,
                    "tm": p.get("tm"),
                })
                continue
            # Reverse-complement match
            rc = _revcomp(pseq)
            pos_rc = assembled_seq.find(rc)
            if pos_rc >= 0:
                primer_sites.append({
                    "name": p.get("name", ""),
                    "start": pos_rc,
                    "end": pos_rc + len(rc),
                    "strand": -1,
                    "tm": p.get("tm"),
                })

    return {
        "topology": topology,
        "total_bp": total_bp,
        "parts": parts,
        "restriction_sites": rsites,
        "primer_sites": primer_sites,
    }


# ---------- helpers --------------------------------------------------------- #

_PART_COLORS = {
    "GFP": "#22c55e", "RFP": "#ef4444", "YFP": "#eab308", "BFP": "#3b82f6",
    "mCherry": "#ec4899", "luciferase": "#f97316",
    "pLac": "#a78bfa", "pTet": "#06b6d4", "pAra": "#14b8a6",
    "pT7": "#f59e0b", "pBad": "#10b981",
    "RBS": "#94a3b8", "terminator": "#64748b",
}


def _part_colors(response: CompileResponse) -> dict[str, str]:
    out: dict[str, str] = {}
    for node in response.circuit.nodes:
        nid = node.id
        for key, color in _PART_COLORS.items():
            if key.lower() in nid.lower():
                out[nid] = color
                break
    return out


_PALETTE = [
    "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#a78bfa",
]


def _default_color(idx: int) -> str:
    return _PALETTE[idx % len(_PALETTE)]


def _effective_seq(seq: str, method: str) -> str:
    """Remove assembly overhangs from display sequence."""
    overlap = 20 if method == "gibson" else 4 if method == "golden_gate" else 0
    if overlap and len(seq) > overlap * 2:
        return seq[overlap:-overlap]
    return seq


_COMPLEMENT = str.maketrans("ACGTUN", "TGCAAN")


def _revcomp(seq: str) -> str:
    return seq.upper().translate(_COMPLEMENT)[::-1]
