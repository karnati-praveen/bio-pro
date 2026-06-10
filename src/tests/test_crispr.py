"""Tests for CRISPR guide RNA design: PAM enumeration and scoring heuristics."""

import pytest
from modules.crispr.core import find_pam_sites, score_guide, design_guides, ENZYMES


# ── PAM enumeration ──────────────────────────────────────────────────────────

def test_spcas9_single_forward_site():
    # Exactly one NGG site; guide = 20 A's, PAM = CGG
    seq = "A" * 20 + "CGG"
    sites = find_pam_sites(seq, pam="NGG", strand="+")
    assert len(sites) == 1
    s = sites[0]
    assert s["guide"] == "A" * 20
    assert s["strand"] == "+"
    assert s["pam_sequence"] == "CGG"
    assert s["guide_start"] == 1           # 1-indexed; guide starts at position 1
    assert s["cut_site"] == 17             # 3 nt upstream of PAM start (pos 21) → pos 18... wait


def test_spcas9_cut_site_position():
    # PAM starts at 0-indexed position 20 → cut_site = 20 - 3 = 17 (1-indexed)
    seq = "A" * 20 + "AGG"                 # NGG = AGG ✓
    sites = find_pam_sites(seq, pam="NGG", strand="+", guide_len=20, cut_offset=3)
    assert len(sites) == 1
    assert sites[0]["cut_site"] == 17


def test_spcas9_two_forward_sites():
    # Two NGG PAMs at different positions
    seq = "A" * 20 + "TGG" + "C" * 20 + "AGG"
    sites = find_pam_sites(seq, pam="NGG", strand="+")
    assert len(sites) == 2
    strands = {s["strand"] for s in sites}
    assert strands == {"+"}


def test_no_pam_returns_empty():
    seq = "A" * 30                          # no NGG anywhere
    assert find_pam_sites(seq, pam="NGG") == []


def test_reverse_strand_site():
    # CCC on + strand = GGG on - strand = NGG match
    # RC of "CCC" + T*20  is  A*20 + GGG  → NGG at pos 20 in RC, guide = A*20
    seq = "CCC" + "T" * 20
    sites = find_pam_sites(seq, pam="NGG", strand="-")
    assert len(sites) == 1
    s = sites[0]
    assert s["strand"] == "-"
    assert s["guide"] == "A" * 20


def test_both_strands_finds_all():
    # Forward NGG + reverse NGG in same sequence
    seq = "A" * 20 + "CGG" + "CCC" + "T" * 20   # fwd NGG at pos 20; rev NGG implied
    fwd = find_pam_sites(seq, pam="NGG", strand="+")
    rev = find_pam_sites(seq, pam="NGG", strand="-")
    both = find_pam_sites(seq, pam="NGG", strand="both")
    assert len(both) == len(fwd) + len(rev)


def test_sacas9_nngrrt_pam():
    # NNGRRT: e.g. AAGAAT matches (A,A,G,A,A,T) - R=A/G, so AAGAAT: pos 2=G✓, pos 3=A(R✓), pos 4=A(R✓), pos 5=T✓
    pam = "AAGAAT"
    seq = "A" * 21 + pam
    sites = find_pam_sites(seq, pam="NNGRRT", strand="+", guide_len=21)
    assert len(sites) == 1
    assert sites[0]["guide"] == "A" * 21


def test_cas12a_5prime_pam():
    # TTTV (V = A/C/G), guide is 3' of PAM
    pam = "TTTG"                            # TTTV with V=G ✓
    seq = pam + "C" * 23
    sites = find_pam_sites(seq, pam="TTTV", strand="+", guide_len=23, pam_side="5prime")
    assert len(sites) == 1
    s = sites[0]
    assert s["guide"] == "C" * 23
    assert s["pam_sequence"] == "TTTG"
    assert s["guide_start"] == 5           # PAM is 4 nt, so guide starts at 5


def test_cas12a_tttv_rejects_tttt():
    # TTTT does not match TTTV (V excludes T)
    seq = "TTTT" + "C" * 23
    sites = find_pam_sites(seq, pam="TTTV", strand="+", guide_len=23, pam_side="5prime")
    assert len(sites) == 0


# ── Scoring heuristics ───────────────────────────────────────────────────────

def test_score_poly_t_penalty():
    # Guide with TTTT run should score lower and produce a warning
    good = "ATCGATCGATCGATCGATCG"           # 50% GC, no poly-T
    bad  = "ATCGATCGATCGATCGTTTT"           # ends in 4 T's
    s_good = score_guide(good)
    s_bad  = score_guide(bad)
    assert s_good["on_target_score"] > s_bad["on_target_score"]
    assert any("poly-T" in w for w in s_bad["warnings"])


def test_score_poly_t_5run_worse_than_4():
    four_t = "ATCGATCGATCGATCGTTTT"
    five_t = "ATCGATCGATCGATGTTTTT"
    assert score_guide(five_t)["on_target_score"] <= score_guide(four_t)["on_target_score"]


def test_score_ideal_gc_no_penalty():
    # ~50% GC, no homopolymers, no poly-T → should score near 100
    guide = "ATCGATCGATCGATCGATCG"          # 50% GC, alternating
    s = score_guide(guide)
    assert s["on_target_score"] >= 80
    assert s["gc_content"] == 50.0


def test_score_low_gc_penalty():
    low_gc = "AAAAAAAAAAAAAAAAAAAA"          # 0% GC
    high_gc = "ATCGATCGATCGATCGATCG"         # 50% GC
    assert score_guide(high_gc)["on_target_score"] > score_guide(low_gc)["on_target_score"]


def test_score_high_gc_penalty():
    high_gc = "GGGGGGGGGGGGGGGGGGGG"          # 100% GC
    ok_gc   = "ATCGATCGATCGATCGATCG"
    assert score_guide(ok_gc)["on_target_score"] > score_guide(high_gc)["on_target_score"]


def test_score_homopolymer_warning():
    guide = "ATCGAAAAAAAATCGATCGC"           # 7 A's in a row
    s = score_guide(guide)
    assert any("homopolymer" in w for w in s["warnings"])


def test_score_off_target_seed_detection():
    # Place the same 12-nt seed twice in the sequence (once true, once off-target)
    guide = "ATCGATCGATCGATCGATCG"
    seed  = guide[-12:]                      # PAM-proximal seed
    # Sequence: true site + seed duplicate elsewhere
    seq = guide + "AGG" + "N" * 10 + seed + "AGG" + "N" * 10
    seq = seq.replace("N", "A")
    s = score_guide(guide, sequence=seq)
    assert s["off_target_seeds"] >= 1
    assert any("off-target" in w for w in s["warnings"])


# ── Full design_guides integration ───────────────────────────────────────────

def test_design_guides_returns_ranked():
    seq = "A" * 20 + "CGG" + "C" * 20 + "AGG"
    guides = design_guides(seq, enzyme="SpCas9")
    assert len(guides) >= 1
    # Ranks are sequential
    ranks = [g["rank"] for g in guides]
    assert ranks == list(range(1, len(guides) + 1))
    # Sorted descending by score
    scores = [g["on_target_score"] for g in guides]
    assert scores == sorted(scores, reverse=True)


def test_design_guides_unknown_enzyme():
    with pytest.raises(ValueError, match="Unknown enzyme"):
        design_guides("A" * 30, enzyme="UnknownCas")


def test_design_guides_sequence_too_short():
    with pytest.raises(ValueError, match="too short"):
        design_guides("ACGT", enzyme="SpCas9")


def test_design_guides_max_guides_respected():
    # Long sequence with many PAM sites; limit output
    seq = ("ATCGATCG" * 5 + "AGG") * 5
    guides = design_guides(seq, enzyme="SpCas9", max_guides=3)
    assert len(guides) <= 3


def test_design_guides_cas12a():
    seq = "TTTG" + "ATCGATCGATCGATCGATCGATCG" + "A" * 10
    guides = design_guides(seq, enzyme="Cas12a")
    assert len(guides) >= 1
    assert guides[0]["strand"] in ("+", "-")


def test_all_enzymes_have_required_keys():
    required = {"pam", "pam_side", "guide_len", "cut_offset", "description"}
    for name, cfg in ENZYMES.items():
        assert required.issubset(cfg.keys()), f"{name} missing keys"
