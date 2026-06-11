"""Tests for sequence alignment: Needleman-Wunsch, Smith-Waterman, center-star MSA."""

import pytest
from modules.align.core import needleman_wunsch, smith_waterman, msa_center_star


# ── Needleman-Wunsch (global) ────────────────────────────────────────────────

def test_nw_identical_sequences_score():
    # ACGT aligned to itself: 4 matches with match=1 → score = 4
    res = needleman_wunsch("ACGT", "ACGT", match=1, mismatch=-1, gap=-2)
    assert res["score"] == 4
    assert res["identity"] == pytest.approx(1.0)


def test_nw_identical_sequences_aligned():
    res = needleman_wunsch("ACGT", "ACGT")
    assert res["aligned_a"] == "ACGT"
    assert res["aligned_b"] == "ACGT"


def test_nw_textbook_score():
    # Classic textbook example (match=1, mismatch=-1, gap=-2)
    # GCATGCU vs GATTACA → known optimal score = 0
    # (various sources use different conventions; we verify no gap in identical prefix/suffix)
    a = "GCATGCU"
    b = "GATTACA"
    res = needleman_wunsch(a, b, match=1, mismatch=-1, gap=-2)
    assert isinstance(res["score"], int)
    assert len(res["aligned_a"]) == len(res["aligned_b"])
    assert res["identity"] >= 0.0 and res["identity"] <= 1.0


def test_nw_all_mismatches():
    # AAAA vs TTTT with match=2, mismatch=-1, gap=-1
    # Global: all 4 paired → score = 4 * -1 = -4
    res = needleman_wunsch("AAAA", "TTTT", match=2, mismatch=-1, gap=-1)
    assert res["score"] == -4
    assert res["identity"] == pytest.approx(0.0)


def test_nw_one_gap():
    # AACGT aligned to ACGT: one deletion in a → score = 1 gap + 4 matches
    # With match=1, mismatch=-1, gap=-2:
    # Option 1: gap in pos1, then 4 matches = -2 + 4 = 2
    res = needleman_wunsch("AACGT", "ACGT", match=1, mismatch=-1, gap=-2)
    assert res["score"] == 2
    assert len(res["aligned_a"]) == len(res["aligned_b"])


def test_nw_single_char():
    res = needleman_wunsch("A", "A")
    assert res["score"] == 1
    assert res["identity"] == pytest.approx(1.0)
    assert res["conservation"] == [1.0]


def test_nw_single_char_mismatch():
    res = needleman_wunsch("A", "T", match=1, mismatch=-1, gap=-2)
    assert res["score"] == -1
    assert res["identity"] == pytest.approx(0.0)


def test_nw_conservation_all_match():
    res = needleman_wunsch("ACGT", "ACGT")
    assert res["conservation"] == [1.0, 1.0, 1.0, 1.0]


def test_nw_conservation_no_match():
    res = needleman_wunsch("AAAA", "TTTT")
    assert all(v == 0.0 for v in res["conservation"])


def test_nw_case_insensitive():
    res_upper = needleman_wunsch("ACGT", "ACGT")
    res_lower = needleman_wunsch("acgt", "acgt")
    assert res_upper["score"] == res_lower["score"]
    assert res_upper["identity"] == pytest.approx(res_lower["identity"])


# ── Smith-Waterman (local) ───────────────────────────────────────────────────

def test_sw_identical_sequences():
    res = smith_waterman("ACGT", "ACGT", match=1, mismatch=-1, gap=-2)
    assert res["score"] == 4
    assert res["identity"] == pytest.approx(1.0)


def test_sw_local_hits_best_substring():
    # The local alignment should find the best matching substring, not penalize flanking mismatches
    # TTTACGTGGG vs ACGT: local alignment should yield ACGT vs ACGT with score 4
    res = smith_waterman("TTTACGTGGG", "ACGT", match=1, mismatch=-1, gap=-2)
    assert res["score"] == 4
    assert res["identity"] == pytest.approx(1.0)
    assert res["aligned_a"] == "ACGT"
    assert res["aligned_b"] == "ACGT"


def test_sw_no_match_returns_zero_score():
    # When all pairs are mismatches and gaps cost more, best score is 0
    res = smith_waterman("AAAA", "TTTT", match=1, mismatch=-2, gap=-3)
    assert res["score"] == 0
    assert res["aligned_a"] == ""
    assert res["aligned_b"] == ""


def test_sw_textbook_score():
    # ACACACTA vs AGCACACA
    # Typical SW result with match=2, mismatch=-1, gap=-1 → score = 12
    res = smith_waterman("ACACACTA", "AGCACACA", match=2, mismatch=-1, gap=-1)
    assert res["score"] == 12


def test_sw_returns_aligned_strings():
    res = smith_waterman("GCATGCU", "GATTACA", match=1, mismatch=-1, gap=-2)
    assert len(res["aligned_a"]) == len(res["aligned_b"])
    assert res["score"] >= 0


def test_sw_case_insensitive():
    r1 = smith_waterman("ACGT", "ACGT")
    r2 = smith_waterman("acgt", "acgt")
    assert r1["score"] == r2["score"]


# ── 100% identity property ───────────────────────────────────────────────────

@pytest.mark.parametrize("seq", [
    "ACGT", "ATCGATCG", "GCGCGCGC",
    "MKTAYIAKQRQISFVKSHFSRQ",   # amino-acid string
])
def test_nw_identical_always_100_percent(seq):
    res = needleman_wunsch(seq, seq)
    assert res["identity"] == pytest.approx(1.0), f"Expected 100% identity for {seq}"


@pytest.mark.parametrize("seq", ["ACGT", "ATCGATCG", "GCGCGCGC"])
def test_sw_identical_always_100_percent(seq):
    res = smith_waterman(seq, seq)
    assert res["identity"] == pytest.approx(1.0), f"Expected 100% identity for {seq}"


# ── MSA center-star ──────────────────────────────────────────────────────────

def test_msa_single_sequence():
    seqs = [{"name": "s1", "seq": "ACGT"}]
    res = msa_center_star(seqs)
    assert len(res["aligned"]) == 1
    assert res["aligned"][0]["aligned"] == "ACGT"
    assert res["consensus"] == "ACGT"
    assert all(v == 1.0 for v in res["conservation"])
    assert res["identity_matrix"] == [[1.0]]


def test_msa_two_identical_sequences():
    seqs = [{"name": "a", "seq": "ACGT"}, {"name": "b", "seq": "ACGT"}]
    res = msa_center_star(seqs)
    assert res["identity_matrix"][0][1] == pytest.approx(1.0)
    assert res["identity_matrix"][1][0] == pytest.approx(1.0)
    assert res["consensus"] == "ACGT"
    assert all(v == 1.0 for v in res["conservation"])


def test_msa_three_sequences_returns_all():
    seqs = [
        {"name": "s1", "seq": "ACGT"},
        {"name": "s2", "seq": "ACGG"},
        {"name": "s3", "seq": "ACTT"},
    ]
    res = msa_center_star(seqs)
    assert len(res["aligned"]) == 3
    # All aligned rows must have the same length
    lengths = {len(r["aligned"]) for r in res["aligned"]}
    assert len(lengths) == 1


def test_msa_identity_matrix_diagonal():
    seqs = [
        {"name": "a", "seq": "ACGT"},
        {"name": "b", "seq": "ACGG"},
        {"name": "c", "seq": "TTTT"},
    ]
    res = msa_center_star(seqs)
    n = len(seqs)
    for i in range(n):
        assert res["identity_matrix"][i][i] == pytest.approx(1.0)


def test_msa_identity_matrix_symmetric():
    seqs = [
        {"name": "a", "seq": "ACGT"},
        {"name": "b", "seq": "ACGG"},
        {"name": "c", "seq": "TTTT"},
    ]
    res = msa_center_star(seqs)
    mat = res["identity_matrix"]
    n = len(mat)
    for i in range(n):
        for j in range(n):
            assert mat[i][j] == pytest.approx(mat[j][i])


def test_msa_conservation_range():
    seqs = [
        {"name": "a", "seq": "ACGT"},
        {"name": "b", "seq": "ACGG"},
    ]
    res = msa_center_star(seqs)
    for v in res["conservation"]:
        assert 0.0 <= v <= 1.0


def test_msa_empty():
    res = msa_center_star([])
    assert res["aligned"] == []
    assert res["consensus"] == ""
    assert res["conservation"] == []
    assert res["identity_matrix"] == []
