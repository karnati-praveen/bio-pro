"""PCR primer design with SantaLucia (1998) nearest-neighbor thermodynamics.

Pure Python — reuses the sequence module's reverse-complement.
"""

from __future__ import annotations

import math

from modules.sequence.core import reverse_complement

# SantaLucia 1998 unified nearest-neighbor parameters: ΔH (kcal/mol), ΔS (cal/mol·K)
_NN = {
    "AA": (-7.9, -22.2), "TT": (-7.9, -22.2), "AT": (-7.2, -20.4), "TA": (-7.2, -21.3),
    "CA": (-8.5, -22.7), "TG": (-8.5, -22.7), "GT": (-8.4, -22.4), "AC": (-8.4, -22.4),
    "CT": (-7.8, -21.0), "AG": (-7.8, -21.0), "GA": (-8.2, -22.2), "TC": (-8.2, -22.2),
    "CG": (-10.6, -27.2), "GC": (-9.8, -24.4), "GG": (-8.0, -19.9), "CC": (-8.0, -19.9),
}
_INIT_GC = (0.1, -2.8)    # initiation with terminal G·C
_INIT_AT = (2.3, 4.1)     # initiation with terminal A·T
_R = 1.987                # gas constant, cal/(mol·K)


def gc_percent(seq: str) -> float:
    s = (seq or "").upper()
    if not s:
        return 0.0
    return round((s.count("G") + s.count("C")) / len(s) * 100, 1)


def nn_tm(seq: str, primer_nM: float = 500.0, na_mM: float = 50.0) -> float:
    """Nearest-neighbor melting temperature (°C) with salt correction."""
    s = (seq or "").upper()
    if len(s) < 2:
        return 0.0
    dh, ds = 0.0, 0.0
    # initiation terms from the terminal base pairs
    for end in (s[0], s[-1]):
        h, sdelta = _INIT_GC if end in "GC" else _INIT_AT
        dh += h
        ds += sdelta
    for i in range(len(s) - 1):
        pair = s[i:i + 2]
        h, sdelta = _NN.get(pair, (0.0, 0.0))
        dh += h
        ds += sdelta
    ct = primer_nM * 1e-9
    tm = (dh * 1000.0) / (ds + _R * math.log(ct / 4.0)) - 273.15
    # SantaLucia salt correction
    tm += 16.6 * math.log10(na_mM / 1000.0)
    return round(tm, 1)


def _has_gc_clamp(seq: str) -> bool:
    return seq[-1].upper() in "GC"


def _self_complementarity(seq: str) -> int:
    """Longest run where the primer is complementary to its own reverse — crude dimer check."""
    s = "".join(c for c in seq.upper() if c in "ACGTUN")
    rc = reverse_complement(s)               # same length as s after cleaning
    best = 0
    n = len(s)
    for shift in range(-(n - 1), n):
        run = 0
        for i in range(n):
            j = i + shift
            if 0 <= j < n and s[i] == rc[j]:
                run += 1
                best = max(best, run)
            else:
                run = 0
    return best


def _pick(template: str, target_tm: float, min_len: int, max_len: int,
          primer_nM: float, na_mM: float) -> dict:
    """Grow a primer from the 5' end of `template` until it reaches the target Tm."""
    best = None
    for length in range(min_len, min(max_len, len(template)) + 1):
        cand = template[:length]
        tm = nn_tm(cand, primer_nM, na_mM)
        score = abs(tm - target_tm) - (1.0 if _has_gc_clamp(cand) else 0.0)
        rec = {
            "sequence": cand,
            "length": length,
            "tm": tm,
            "gc": gc_percent(cand),
            "gc_clamp": _has_gc_clamp(cand),
            "self_complementarity": _self_complementarity(cand),
        }
        if best is None or score < best[0]:
            best = (score, rec)
        if tm >= target_tm and _has_gc_clamp(cand):
            return rec
    return best[1]


def design_primers(sequence: str, target_tm: float = 60.0, min_len: int = 18,
                   max_len: int = 25, primer_nM: float = 500.0, na_mM: float = 50.0) -> list[dict]:
    """Design forward + reverse primers flanking a target sequence."""
    seq = (sequence or "").upper().replace(" ", "")
    if len(seq) < min_len * 2:
        raise ValueError("Sequence too short to design a forward and reverse primer.")

    fwd = _pick(seq, target_tm, min_len, max_len, primer_nM, na_mM)
    fwd.update({"name": "Forward", "purpose": "Anneals to the 5' (sense) end"})

    rev_template = reverse_complement(seq)
    rev = _pick(rev_template, target_tm, min_len, max_len, primer_nM, na_mM)
    rev.update({"name": "Reverse", "purpose": "Anneals to the 3' (antisense) end"})

    amplicon = len(seq)
    for p in (fwd, rev):
        p["warnings"] = []
        if p["self_complementarity"] >= 4:
            p["warnings"].append("possible self-dimer/hairpin")
        if not p["gc_clamp"]:
            p["warnings"].append("no 3' GC clamp")
        if abs(p["tm"] - target_tm) > 5:
            p["warnings"].append("Tm far from target")
        p["amplicon_size"] = amplicon
    return [fwd, rev]
