"""Sequence alignment algorithms: Needleman-Wunsch, Smith-Waterman, center-star MSA."""

from __future__ import annotations

from collections import Counter
from typing import TypedDict


class SeqEntry(TypedDict):
    name: str
    seq: str


class PairResult(TypedDict):
    aligned_a: str
    aligned_b: str
    score: int
    identity: float
    conservation: list[float]


class MsaResult(TypedDict):
    aligned: list[dict]        # [{"name": str, "aligned": str}]
    consensus: str
    conservation: list[float]
    identity_matrix: list[list[float]]


# ---------------------------------------------------------------------------
# Needleman-Wunsch (global alignment)
# ---------------------------------------------------------------------------

def needleman_wunsch(
    a: str, b: str, match: int = 1, mismatch: int = -1, gap: int = -2
) -> PairResult:
    a, b = a.upper(), b.upper()
    m, n = len(a), len(b)

    # DP table + traceback codes: 1=diag, 2=up, 3=left
    F = [[0] * (n + 1) for _ in range(m + 1)]
    T = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(1, m + 1):
        F[i][0] = i * gap
        T[i][0] = 2
    for j in range(1, n + 1):
        F[0][j] = j * gap
        T[0][j] = 3

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            s = match if a[i - 1] == b[j - 1] else mismatch
            diag = F[i - 1][j - 1] + s
            up   = F[i - 1][j] + gap
            left = F[i][j - 1] + gap
            best = max(diag, up, left)
            F[i][j] = best
            T[i][j] = 1 if best == diag else (2 if best == up else 3)

    # Traceback
    ra, rb = [], []
    i, j = m, n
    while i > 0 or j > 0:
        t = T[i][j]
        if t == 1:
            ra.append(a[i - 1]); rb.append(b[j - 1]); i -= 1; j -= 1
        elif t == 2:
            ra.append(a[i - 1]); rb.append("-"); i -= 1
        else:
            ra.append("-"); rb.append(b[j - 1]); j -= 1

    al_a = "".join(reversed(ra))
    al_b = "".join(reversed(rb))

    return _pair_stats(al_a, al_b, F[m][n])


# ---------------------------------------------------------------------------
# Smith-Waterman (local alignment)
# ---------------------------------------------------------------------------

def smith_waterman(
    a: str, b: str, match: int = 1, mismatch: int = -1, gap: int = -2
) -> PairResult:
    a, b = a.upper(), b.upper()
    m, n = len(a), len(b)

    H = [[0] * (n + 1) for _ in range(m + 1)]
    T = [[0] * (n + 1) for _ in range(m + 1)]

    max_score, max_i, max_j = 0, 0, 0

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            s = match if a[i - 1] == b[j - 1] else mismatch
            diag = H[i - 1][j - 1] + s
            up   = H[i - 1][j] + gap
            left = H[i][j - 1] + gap
            best = max(0, diag, up, left)
            H[i][j] = best
            if best == 0:
                T[i][j] = 0
            elif best == diag:
                T[i][j] = 1
            elif best == up:
                T[i][j] = 2
            else:
                T[i][j] = 3
            if best > max_score:
                max_score = best
                max_i, max_j = i, j

    # Traceback from max cell until score drops to 0
    ra, rb = [], []
    i, j = max_i, max_j
    while i > 0 and j > 0 and H[i][j] > 0:
        t = T[i][j]
        if t == 1:
            ra.append(a[i - 1]); rb.append(b[j - 1]); i -= 1; j -= 1
        elif t == 2:
            ra.append(a[i - 1]); rb.append("-"); i -= 1
        else:
            ra.append("-"); rb.append(b[j - 1]); j -= 1

    al_a = "".join(reversed(ra))
    al_b = "".join(reversed(rb))

    return _pair_stats(al_a, al_b, max_score)


# ---------------------------------------------------------------------------
# Center-star MSA (≤ ~20 sequences)
# ---------------------------------------------------------------------------

def msa_center_star(
    sequences: list[SeqEntry],
    match: int = 1,
    mismatch: int = -1,
    gap: int = -2,
) -> MsaResult:
    n = len(sequences)

    if n == 0:
        return {"aligned": [], "consensus": "", "conservation": [], "identity_matrix": []}

    if n == 1:
        s = sequences[0]["seq"].upper()
        return {
            "aligned": [{"name": sequences[0]["name"], "aligned": s}],
            "consensus": s,
            "conservation": [1.0] * len(s),
            "identity_matrix": [[1.0]],
        }

    seqs = [{"name": e["name"], "seq": e["seq"].upper()} for e in sequences]

    # All-pairs pairwise NW
    pw: dict[tuple[int, int], PairResult] = {}
    for i in range(n):
        for j in range(i + 1, n):
            res = needleman_wunsch(seqs[i]["seq"], seqs[j]["seq"], match, mismatch, gap)
            pw[(i, j)] = pw[(j, i)] = res  # type: ignore[assignment]

    # Center = sequence with maximum sum of pairwise identity to all others
    def total_identity(idx: int) -> float:
        return sum(pw[(idx, j)]["identity"] for j in range(n) if j != idx)

    center = max(range(n), key=total_identity)

    # Progressive merge: align each non-center sequence to center, merge gaps
    msa_rows: list[str] = [seqs[center]["seq"]]   # row 0 = center
    row_order: list[int] = [center]

    for i in range(n):
        if i == center:
            continue
        pair = pw[(center, i)]
        ac, ai = pair["aligned_a"], pair["aligned_b"]
        # Insert gaps into all existing MSA rows where the center now has gaps
        msa_rows, ai = _merge_into_msa(msa_rows, ac, ai)
        msa_rows.append(ai)
        row_order.append(i)

    # Re-order rows back to original sequence order
    n_cols = len(msa_rows[0])
    ordered: list[str | None] = [None] * n
    for k, orig_idx in enumerate(row_order):
        ordered[orig_idx] = msa_rows[k]

    # Consensus + conservation
    consensus_chars: list[str] = []
    conservation: list[float] = []
    for col in range(n_cols):
        residues = [r[col] for r in ordered if r is not None and r[col] != "-"]  # type: ignore[index]
        if not residues:
            consensus_chars.append("-")
            conservation.append(0.0)
        else:
            top, count = Counter(residues).most_common(1)[0]
            consensus_chars.append(top)
            conservation.append(count / n)

    # Identity matrix
    identity_matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        identity_matrix[i][i] = 1.0
        for j in range(i + 1, n):
            ri = ordered[i] or ""
            rj = ordered[j] or ""
            m_count = sum(1 for a, b in zip(ri, rj) if a == b and a != "-")
            t_count = sum(1 for a, b in zip(ri, rj) if a != "-" and b != "-")
            ident = m_count / t_count if t_count else 0.0
            identity_matrix[i][j] = identity_matrix[j][i] = ident

    return {
        "aligned": [
            {"name": seqs[i]["name"], "aligned": ordered[i] or ""}
            for i in range(n)
        ],
        "consensus": "".join(consensus_chars),
        "conservation": conservation,
        "identity_matrix": identity_matrix,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pair_stats(al_a: str, al_b: str, score: int) -> PairResult:
    matches = sum(1 for a, b in zip(al_a, al_b) if a == b and a != "-")
    aligned_pairs = sum(1 for a, b in zip(al_a, al_b) if a != "-" and b != "-")
    identity = matches / aligned_pairs if aligned_pairs else 0.0
    conservation = [1.0 if a == b else 0.0 for a, b in zip(al_a, al_b)]
    return {
        "aligned_a": al_a,
        "aligned_b": al_b,
        "score": score,
        "identity": identity,
        "conservation": conservation,
    }


def _merge_into_msa(
    msa_rows: list[str], new_center: str, new_other: str
) -> tuple[list[str], str]:
    """Insert gap columns into msa_rows wherever new_center has gaps that the
    accumulated MSA center (msa_rows[0]) does not, and vice-versa."""
    current_center = msa_rows[0]
    result_rows: list[list[str]] = [[] for _ in msa_rows]
    result_other: list[str] = []

    ci = 0  # pointer into current_center / current MSA columns
    ni = 0  # pointer into new_center alignment columns

    while ci < len(current_center) or ni < len(new_center):
        cc = current_center[ci] if ci < len(current_center) else None
        nc = new_center[ni] if ni < len(new_center) else None

        if cc == "-" and nc == "-":
            # Both gap → copy column, advance both
            for k, row in enumerate(msa_rows):
                result_rows[k].append(row[ci])
            result_other.append(new_other[ni])
            ci += 1; ni += 1

        elif cc == "-":
            # Current MSA center gap, new alignment has residue → copy MSA gap column
            for k, row in enumerate(msa_rows):
                result_rows[k].append(row[ci])
            result_other.append("-")
            ci += 1

        elif nc == "-":
            # New alignment center gap, current MSA has residue → insert gap column
            for k in range(len(msa_rows)):
                result_rows[k].append("-")
            result_other.append(new_other[ni])
            ni += 1

        else:
            # Both have residues → aligned column
            for k, row in enumerate(msa_rows):
                result_rows[k].append(row[ci])
            result_other.append(new_other[ni])
            ci += 1; ni += 1

    merged = ["".join(r) for r in result_rows]
    return merged, "".join(result_other)
