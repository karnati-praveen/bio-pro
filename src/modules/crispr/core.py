"""CRISPR guide RNA design: PAM enumeration, on-target scoring, off-target detection.

Pure Python — no external dependencies.
Supports SpCas9 (NGG), SaCas9 (NNGRRT), and Cas12a/Cpf1 (TTTV, 5' PAM).
"""

from __future__ import annotations

from modules.sequence.core import reverse_complement

# IUPAC ambiguity codes → set of matching nucleotides
_IUPAC: dict[str, frozenset[str]] = {
    "A": frozenset("A"), "C": frozenset("C"), "G": frozenset("G"), "T": frozenset("T"),
    "N": frozenset("ACGT"),
    "R": frozenset("AG"),    # puRine
    "Y": frozenset("CT"),    # pYrimidine
    "S": frozenset("GC"),    # Strong
    "W": frozenset("AT"),    # Weak
    "K": frozenset("GT"),    # Keto
    "M": frozenset("AC"),    # aMino
    "B": frozenset("CGT"),   # not A
    "D": frozenset("AGT"),   # not C
    "H": frozenset("ACT"),   # not G
    "V": frozenset("ACG"),   # not T
}

ENZYMES: dict[str, dict] = {
    "SpCas9": {
        "pam": "NGG",
        "pam_side": "3prime",
        "guide_len": 20,
        "cut_offset": 3,
        "description": "Streptococcus pyogenes Cas9 — most widely used; 20 nt guide + NGG PAM",
    },
    "SaCas9": {
        "pam": "NNGRRT",
        "pam_side": "3prime",
        "guide_len": 21,
        "cut_offset": 3,
        "description": "Staphylococcus aureus Cas9 — compact; 21 nt guide + NNGRRT PAM",
    },
    "Cas12a": {
        "pam": "TTTV",
        "pam_side": "5prime",
        "guide_len": 23,
        "cut_offset": 18,
        "description": "Francisella novicida Cas12a/Cpf1 — 5' PAM; 5-nt staggered cut",
    },
}


def _match_pam(seq_sub: str, pam: str) -> bool:
    return len(seq_sub) == len(pam) and all(
        c in _IUPAC.get(p, frozenset(p)) for c, p in zip(seq_sub, pam)
    )


def _max_run(seq: str, base: str) -> int:
    best = run = 0
    for c in seq:
        run = run + 1 if c == base else 0
        if run > best:
            best = run
    return best


def find_pam_sites(
    sequence: str,
    pam: str = "NGG",
    strand: str = "both",
    guide_len: int = 20,
    pam_side: str = "3prime",
    cut_offset: int = 3,
) -> list[dict]:
    """Enumerate all protospacer sites adjacent to the PAM in *sequence*.

    Returns list of dicts with keys:
      guide          — guide RNA sequence (5'→3')
      strand         — "+" or "-"
      pam_sequence   — observed PAM bases
      guide_start    — 1-indexed start of protospacer on + strand (leftmost)
      cut_site       — 1-indexed position on + strand backbone after which cut occurs
    """
    seq = sequence.upper()
    pam_up = pam.upper()
    pam_len = len(pam_up)
    n = len(seq)
    results: list[dict] = []

    def _search(s: str, strand_label: str) -> None:
        if pam_side == "3prime":
            # PAM is immediately 3' of the protospacer on this strand.
            # Scan position i = PAM start; guide = s[i-guide_len : i]
            for i in range(guide_len, n - pam_len + 1):
                if not _match_pam(s[i : i + pam_len], pam_up):
                    continue
                guide = s[i - guide_len : i]
                if strand_label == "+":
                    # guide_start (0-indexed on +) = i - guide_len
                    guide_start_1 = i - guide_len + 1
                    # SpCas9/SaCas9 cut cut_offset nt upstream of PAM start
                    cut_site_1 = i - cut_offset
                else:
                    # s = RC(seq); RC position i → original position n-1-i
                    # Guide in RC at [i-guide_len, i) maps to + strand [n-i, n-i+guide_len)
                    guide_start_1 = n - i + 1         # leftmost on + strand (1-indexed)
                    cut_site_1 = n - i + cut_offset    # symmetric cut
                results.append({
                    "guide": guide,
                    "strand": strand_label,
                    "pam_sequence": s[i : i + pam_len],
                    "guide_start": guide_start_1,
                    "cut_site": cut_site_1,
                })
        else:  # 5prime PAM (Cas12a)
            # PAM is immediately 5' of the protospacer on this strand.
            # Scan position i = PAM start; guide = s[i+pam_len : i+pam_len+guide_len]
            for i in range(n - pam_len - guide_len + 1):
                if not _match_pam(s[i : i + pam_len], pam_up):
                    continue
                guide = s[i + pam_len : i + pam_len + guide_len]
                if strand_label == "+":
                    guide_start_1 = i + pam_len + 1
                    # cut_offset nt from the 5' end of the protospacer
                    cut_site_1 = i + pam_len + cut_offset
                else:
                    # RC position i: guide maps to + strand [n-i-pam_len-guide_len, n-i-pam_len)
                    guide_start_1 = n - i - pam_len - guide_len + 1
                    # Cut cut_offset nt from 5' end on - strand = cut_offset from guide's
                    # rightmost + strand position going leftward
                    guide_end_1 = n - i - pam_len      # rightmost + strand pos (1-indexed)
                    cut_site_1 = guide_end_1 - cut_offset + 1
                results.append({
                    "guide": guide,
                    "strand": strand_label,
                    "pam_sequence": s[i : i + pam_len],
                    "guide_start": guide_start_1,
                    "cut_site": cut_site_1,
                })

    if strand in ("both", "+"):
        _search(seq, "+")
    if strand in ("both", "-"):
        _search(reverse_complement(seq), "-")

    return results


def score_guide(guide: str, sequence: str = "", seed_len: int = 12) -> dict:
    """Compute on-target and off-target scores for *guide*.

    Returns:
      on_target_score  — 0-100 heuristic (GC content, homopolymers, position weights)
      gc_content       — GC percentage
      off_target_seeds — count of extra seed-region matches in *sequence* (0 = clean)
      warnings         — list of human-readable warning strings
    """
    g = guide.upper()
    n = len(g)
    if not n:
        return {"on_target_score": 0.0, "gc_content": 0.0, "off_target_seeds": 0,
                "warnings": ["empty guide"]}

    gc_frac = (g.count("G") + g.count("C")) / n
    warnings: list[str] = []
    score = 100.0

    # GC content: linear penalty outside the 40-70% optimal range
    if gc_frac < 0.40:
        score -= (0.40 - gc_frac) * 150
    elif gc_frac > 0.70:
        score -= (gc_frac - 0.70) * 150

    # Poly-T: RNAPIII (U6) terminates at ≥4 consecutive T's
    max_t = _max_run(g, "T")
    if max_t >= 4:
        score -= 25.0
        warnings.append(
            f"poly-T run ({max_t} consecutive T's): may cause premature U6 termination"
        )
    elif max_t == 3:
        score -= 8.0

    # Homopolymer run ≥ 5 for A, C, G
    for b in "ACG":
        mr = _max_run(g, b)
        if mr >= 5:
            score -= 10.0
            warnings.append(f"homopolymer run ({b}×{mr})")

    # Position-weighted heuristics (simplified Rule Set 1)
    if g[0] == "T":
        score -= 5.0   # 5' T slightly disfavored
    if g[-1] not in "GC":
        score -= 5.0   # PAM-proximal base should be G or C

    score = max(0.0, min(100.0, score))

    # Off-target proximity: scan for the PAM-proximal seed in the supplied sequence
    off_target_seeds = 0
    if sequence and n >= seed_len:
        seed = g[-seed_len:]
        seq_upper = sequence.upper()
        rc_seed = reverse_complement(seed)
        nn = len(seq_upper)
        hits = sum(
            1
            for i in range(nn - seed_len + 1)
            if seq_upper[i : i + seed_len] in (seed, rc_seed)
        )
        # One hit is the intended target site
        off_target_seeds = max(0, hits - 1)
        if off_target_seeds > 0:
            score -= min(30.0, off_target_seeds * 5.0)
            score = max(0.0, score)
            warnings.append(
                f"seed region matches {off_target_seeds} potential off-target "
                f"site(s) in provided sequence"
            )

    return {
        "on_target_score": round(score, 1),
        "gc_content": round(gc_frac * 100, 1),
        "off_target_seeds": off_target_seeds,
        "warnings": warnings,
    }


def design_guides(
    sequence: str,
    enzyme: str = "SpCas9",
    strand: str = "both",
    max_guides: int = 20,
) -> list[dict]:
    """Find, score, and rank all guide RNAs for *enzyme* in *sequence*.

    Returns up to *max_guides* results sorted by on_target_score descending.
    Each result dict contains: rank, guide, strand, pam, guide_start, cut_site,
    gc_content, on_target_score, off_target_seeds, warnings.
    """
    cfg = ENZYMES.get(enzyme)
    if cfg is None:
        raise ValueError(f"Unknown enzyme '{enzyme}'. Choose from: {list(ENZYMES)}")

    seq = sequence.upper().replace(" ", "").replace("\n", "").replace("\r", "")
    if not seq:
        raise ValueError("Sequence is empty.")
    min_len = cfg["guide_len"] + len(cfg["pam"])
    if len(seq) < min_len:
        raise ValueError(
            f"Sequence too short for {enzyme}: need ≥ {min_len} nt, got {len(seq)}."
        )

    sites = find_pam_sites(
        seq,
        pam=cfg["pam"],
        strand=strand,
        guide_len=cfg["guide_len"],
        pam_side=cfg["pam_side"],
        cut_offset=cfg["cut_offset"],
    )

    guides: list[dict] = []
    for site in sites:
        sc = score_guide(site["guide"], seq)
        guides.append({
            "rank": 0,
            "guide": site["guide"],
            "strand": site["strand"],
            "pam": site["pam_sequence"],
            "guide_start": site["guide_start"],
            "cut_site": site["cut_site"],
            "gc_content": sc["gc_content"],
            "on_target_score": sc["on_target_score"],
            "off_target_seeds": sc["off_target_seeds"],
            "warnings": sc["warnings"],
        })

    guides.sort(key=lambda g: -g["on_target_score"])

    for i, g in enumerate(guides[:max_guides], 1):
        g["rank"] = i

    return guides[:max_guides]
