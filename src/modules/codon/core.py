"""Codon optimization — pure Python, no third-party dependencies.

Codon usage tables (per-1000-codons) from:
  E. coli K-12 MG1655  (~4 300 ORFs)
  S. cerevisiae S288C   (~5 900 ORFs)
  Homo sapiens          (~36 000 ORFs)
"""

import math
import re
from itertools import product as iproduct

from modules.sequence.core import CODON_TABLE, ENZYMES

# ─────────────────────────────────────────────────────────────── #
# Codon usage tables                                              #
# ─────────────────────────────────────────────────────────────── #
CODON_USAGE: dict[str, dict[str, float]] = {
    "ecoli": {
        "TTT": 22.4, "TTC": 16.7,
        "TTA": 13.9, "TTG": 13.1, "CTT": 10.8, "CTC": 11.4, "CTA":  3.9, "CTG": 52.7,
        "ATT": 30.0, "ATC": 25.3, "ATA":  7.4,
        "ATG": 27.8,
        "GTT": 18.1, "GTC": 15.3, "GTA": 10.8, "GTG": 26.4,
        "TCT":  8.5, "TCC":  8.9, "TCA":  7.2, "TCG":  8.8, "AGT":  8.8, "AGC": 16.1,
        "CCT":  7.2, "CCC":  5.5, "CCA":  8.4, "CCG": 22.5,
        "ACT":  9.6, "ACC": 23.3, "ACA":  7.5, "ACG": 14.4,
        "GCT": 15.3, "GCC": 25.5, "GCA": 21.1, "GCG": 33.4,
        "TAT": 16.2, "TAC": 12.3,
        "TAA":  2.0, "TAG":  0.3, "TGA":  1.0,
        "CAT": 13.0, "CAC":  9.7,
        "CAA": 15.3, "CAG": 28.3,
        "AAT": 17.8, "AAC": 22.5,
        "AAA": 33.6, "AAG": 10.1,
        "GAT": 32.0, "GAC": 19.0,
        "GAA": 39.4, "GAG": 18.3,
        "TGT":  5.1, "TGC":  6.3,
        "TGG": 15.2,
        "CGT": 21.4, "CGC": 22.0, "CGA":  3.6, "CGG":  5.4, "AGA":  2.1, "AGG":  1.2,
        "GGT": 24.6, "GGC": 29.8, "GGA":  8.2, "GGG": 11.1,
    },
    "yeast": {
        "TTT": 18.0, "TTC": 21.0,
        "TTA": 13.0, "TTG": 27.0, "CTT": 11.0, "CTC":  5.0, "CTA": 13.0, "CTG": 10.0,
        "ATT": 22.0, "ATC": 18.0, "ATA": 17.0,
        "ATG": 21.0,
        "GTT": 18.0, "GTC": 11.0, "GTA": 11.0, "GTG": 11.0,
        "TCT": 23.0, "TCC": 16.0, "TCA": 14.0, "TCG": 10.0, "AGT": 14.0, "AGC": 11.0,
        "CCT": 13.0, "CCC":  7.0, "CCA": 18.0, "CCG":  5.0,
        "ACT": 20.0, "ACC": 14.0, "ACA": 17.0, "ACG":  7.0,
        "GCT": 21.0, "GCC": 13.0, "GCA": 16.0, "GCG":  6.0,
        "TAT": 18.0, "TAC": 15.0,
        "TAA":  1.5, "TAG":  0.4, "TGA":  0.6,
        "CAT": 13.0, "CAC":  8.0,
        "CAA": 27.0, "CAG": 12.0,
        "AAT": 36.0, "AAC": 25.0,
        "AAA": 41.0, "AAG": 30.0,
        "GAT": 37.0, "GAC": 21.0,
        "GAA": 45.0, "GAG": 19.0,
        "TGT":  8.0, "TGC":  5.0,
        "TGG": 10.0,
        "CGT":  6.0, "CGC":  2.0, "CGA":  3.0, "CGG":  2.0, "AGA": 21.0, "AGG":  9.0,
        "GGT": 23.0, "GGC": 10.0, "GGA": 11.0, "GGG":  6.0,
    },
    "human": {
        "TTT": 17.6, "TTC": 20.3,
        "TTA":  7.7, "TTG": 12.9, "CTT": 13.2, "CTC": 19.6, "CTA":  7.2, "CTG": 39.6,
        "ATT": 16.0, "ATC": 20.8, "ATA":  7.5,
        "ATG": 22.0,
        "GTT": 11.0, "GTC": 14.5, "GTA":  7.1, "GTG": 28.1,
        "TCT": 15.2, "TCC": 17.7, "TCA": 12.2, "TCG":  4.4, "AGT": 15.2, "AGC": 19.5,
        "CCT": 17.5, "CCC": 19.8, "CCA": 16.9, "CCG":  6.9,
        "ACT": 13.1, "ACC": 18.9, "ACA": 15.1, "ACG":  6.1,
        "GCT": 18.4, "GCC": 27.7, "GCA": 15.8, "GCG":  6.2,
        "TAT": 12.2, "TAC": 15.3,
        "TAA":  1.0, "TAG":  0.8, "TGA":  1.6,
        "CAT": 10.9, "CAC": 15.1,
        "CAA": 12.3, "CAG": 34.2,
        "AAT": 17.0, "AAC": 19.1,
        "AAA": 24.4, "AAG": 31.9,
        "GAT": 21.8, "GAC": 25.1,
        "GAA": 29.0, "GAG": 39.6,
        "TGT": 10.6, "TGC": 12.6,
        "TGG": 13.2,
        "CGT":  4.5, "CGC": 10.4, "CGA":  6.2, "CGG": 11.4, "AGA": 11.5, "AGG": 11.9,
        "GGT": 10.8, "GGC": 22.2, "GGA": 16.5, "GGG": 16.5,
    },
}

# ─────────────────────────────────────────────────────────────── #
# Synonymous codon groups                                         #
# ─────────────────────────────────────────────────────────────── #
_SYNONYMS: dict[str, list[str]] = {}
for _codon, _aa in CODON_TABLE.items():
    _SYNONYMS.setdefault(_aa, []).append(_codon)


def synonyms_for(aa: str) -> list[str]:
    return _SYNONYMS.get(aa, [])


# ─────────────────────────────────────────────────────────────── #
# Internal helpers                                                #
# ─────────────────────────────────────────────────────────────── #
def _clean_dna(seq: str) -> str:
    return re.sub(r"[^ACGTU]", "", seq.upper()).replace("U", "T")


def _is_protein(seq: str) -> bool:
    """True if seq contains letters outside the DNA/RNA alphabet."""
    return bool(re.search(r"[^ACGTUacgtuNn*\s\-]", seq))


def _calc_cai(codons: list[str], table: dict[str, float]) -> float:
    """Geometric mean of per-codon relative adaptedness (w) values."""
    ws: list[float] = []
    for codon in codons:
        aa = CODON_TABLE.get(codon)
        if not aa or aa == "*":
            continue
        syns = _SYNONYMS.get(aa, [])
        if len(syns) <= 1:
            continue  # Met / Trp — no degeneracy, skip
        max_freq = max(table.get(s, 0.0) for s in syns)
        freq = table.get(codon, 0.0)
        if max_freq > 0 and freq > 0:
            ws.append(freq / max_freq)
    if not ws:
        return 0.0
    return round(math.exp(sum(math.log(w) for w in ws) / len(ws)), 4)


def _codon_w(codon: str, table: dict[str, float]) -> float:
    """Relative adaptedness of a single codon (0–1), used for heatmap."""
    aa = CODON_TABLE.get(codon)
    if not aa or aa == "*":
        return 1.0
    syns = _SYNONYMS.get(aa, [])
    if len(syns) <= 1:
        return 1.0
    max_freq = max(table.get(s, 0.0) for s in syns)
    freq = table.get(codon, 0.0)
    return round(freq / max_freq, 4) if max_freq > 0 else 0.0


# ─────────────────────────────────────────────────────────────── #
# Public API                                                      #
# ─────────────────────────────────────────────────────────────── #
def optimize(protein_or_dna: str, host: str) -> dict:
    """Back-translate a protein or recode a CDS to the host's preferred codons.

    Returns {optimized_seq, cai_before, cai_after, changes, removed_sites,
             codon_table}.  `codon_table` carries per-codon w values for the
             heatmap (indexed by position in the *optimized* sequence).
    """
    table = CODON_USAGE.get(host)
    if table is None:
        raise ValueError(f"Unknown host '{host}'. Choices: {list(CODON_USAGE)}")

    cleaned = re.sub(r"\s", "", protein_or_dna.upper())

    if _is_protein(cleaned):
        protein = cleaned.rstrip("*")
        original_codons: list[str] | None = None
        cai_before = 0.0
    else:
        dna = _clean_dna(cleaned)
        raw = [dna[i:i + 3] for i in range(0, len(dna) - 2, 3)]
        protein = "".join(CODON_TABLE.get(c, "X") for c in raw).rstrip("*")
        original_codons = raw[: len(protein)]
        cai_before = _calc_cai(original_codons, table)

    # Choose best codon per position
    optimized: list[str] = []
    for aa in protein:
        if aa == "*":
            break
        syns = _SYNONYMS.get(aa, [])
        if not syns:
            raise ValueError(f"Unknown amino acid: {aa!r}")
        best = max(syns, key=lambda c: table.get(c, 0.0))
        optimized.append(best)

    cai_after = _calc_cai(optimized, table)

    changes = []
    for i, (new_c, aa) in enumerate(zip(optimized, protein)):
        orig = original_codons[i] if original_codons and i < len(original_codons) else None
        if orig != new_c:
            changes.append({
                "position": i,
                "original_codon": orig or "---",
                "new_codon": new_c,
                "amino_acid": aa,
            })

    codon_heatmap = [
        {"codon": c, "amino_acid": aa, "w": _codon_w(c, table)}
        for c, aa in zip(optimized, protein)
    ]

    return {
        "optimized_seq": "".join(optimized),
        "cai_before": cai_before,
        "cai_after": cai_after,
        "changes": changes,
        "removed_sites": [],
        "codon_heatmap": codon_heatmap,
    }


def avoid_sites(seq: str, enzymes: list[str] | None = None) -> dict:
    """Silently recode seq to destroy restriction sites, poly-A signals, and
    poly-T runs without altering the encoded protein.

    Returns {optimized_seq, removed_sites}.
    """
    dna = _clean_dna(re.sub(r"\s", "", seq))
    n_codons = len(dna) // 3
    codons = [dna[i * 3:(i + 1) * 3] for i in range(n_codons)]
    protein = [CODON_TABLE.get(c, "X") for c in codons]

    chosen = enzymes if enzymes is not None else list(ENZYMES.keys())
    targets: dict[str, str] = {name: ENZYMES[name] for name in chosen if name in ENZYMES}
    # Add prokaryotic/eukaryotic problematic sequences
    targets["polyA_signal"] = "AATAAA"
    targets["polyT_run"] = "TTTTTT"

    removed: set[str] = set()

    for site_name, site_seq in targets.items():
        for _attempt in range(30):
            curr = "".join(codons)
            pos = curr.find(site_seq)
            if pos == -1:
                break

            start_c = pos // 3
            end_c = min((pos + len(site_seq) - 1) // 3 + 1, n_codons)

            fixed = False
            # Try single-codon swaps first (fast)
            for ci in range(start_c, end_c):
                aa = protein[ci]
                for alt in _SYNONYMS.get(aa, []):
                    if alt == codons[ci]:
                        continue
                    test = codons[:]
                    test[ci] = alt
                    if site_seq not in "".join(test):
                        codons[ci] = alt
                        removed.add(site_name)
                        fixed = True
                        break
                if fixed:
                    break

            if not fixed:
                # Try two-codon combos for stubborn sites
                span = list(range(start_c, end_c))
                if len(span) >= 2:
                    for ci, cj in ((span[i], span[j])
                                   for i in range(len(span))
                                   for j in range(i + 1, len(span))):
                        for alt_i, alt_j in iproduct(
                            _SYNONYMS.get(protein[ci], [codons[ci]]),
                            _SYNONYMS.get(protein[cj], [codons[cj]]),
                        ):
                            if alt_i == codons[ci] and alt_j == codons[cj]:
                                continue
                            test = codons[:]
                            test[ci] = alt_i
                            test[cj] = alt_j
                            if site_seq not in "".join(test):
                                codons[ci] = alt_i
                                codons[cj] = alt_j
                                removed.add(site_name)
                                fixed = True
                                break
                        if fixed:
                            break
                break  # can't fix — move on

    return {"optimized_seq": "".join(codons), "removed_sites": sorted(removed)}


def gc_window_balance(seq: str, target: float = 0.5, window: int = 50) -> dict:
    """Smooth extreme-GC windows by synonymous recoding.

    Returns {optimized_seq}.
    """
    dna = _clean_dna(re.sub(r"\s", "", seq))
    n_codons = len(dna) // 3
    codons = [dna[i * 3:(i + 1) * 3] for i in range(n_codons)]
    protein = [CODON_TABLE.get(c, "X") for c in codons]

    threshold = 0.15

    def _gc_frac(s: str) -> float:
        return (s.count("G") + s.count("C")) / len(s) if s else 0.0

    def _codon_gc(c: str) -> int:
        return c.count("G") + c.count("C")

    for _ in range(200):
        curr = "".join(codons)
        improved = False
        step = max(1, window // 2)
        for i in range(0, len(curr) - window + 1, step):
            chunk = curr[i:i + window]
            gc = _gc_frac(chunk)
            if abs(gc - target) <= threshold:
                continue
            too_high = gc > target + threshold
            start_c = i // 3
            end_c = min((i + window) // 3, n_codons)
            for ci in range(start_c, end_c):
                aa = protein[ci]
                syns = _SYNONYMS.get(aa, [codons[ci]])
                if len(syns) <= 1:
                    continue
                cur_gc = _codon_gc(codons[ci])
                alts = sorted(syns, key=_codon_gc, reverse=not too_high)
                for alt in alts:
                    ag = _codon_gc(alt)
                    if (too_high and ag < cur_gc) or (not too_high and ag > cur_gc):
                        codons[ci] = alt
                        improved = True
                        break
        if not improved:
            break

    return {"optimized_seq": "".join(codons)}
