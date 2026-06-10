"""Tests for the codon optimization module.

Covers:
  - CAI improves after optimization
  - Protein translation is preserved (DNA input and protein input)
  - Chosen restriction sites are removed
  - gc_window_balance moves GC toward the target
  - CAI calculation is sensible for known sequences
"""

import pytest
from modules.codon.core import (
    optimize,
    avoid_sites,
    gc_window_balance,
    CODON_USAGE,
    _calc_cai,
    _SYNONYMS,
)
from modules.sequence.core import CODON_TABLE, ENZYMES


# ── Helpers ──────────────────────────────────────────────────── #
def translate(dna: str) -> str:
    dna = dna.upper()
    return "".join(CODON_TABLE.get(dna[i:i+3], "X") for i in range(0, len(dna)-2, 3))


# ── optimize: protein input ───────────────────────────────────── #
def test_optimize_protein_input_ecoli():
    protein = "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK"
    result = optimize(protein, "ecoli")

    assert result["cai_before"] == 0.0  # no original DNA
    assert result["cai_after"] > 0.7    # well-optimized
    assert result["optimized_seq"]

    # Protein round-trip
    dna = result["optimized_seq"]
    assert translate(dna) == protein


def test_optimize_protein_input_yeast():
    protein = "MAEGEITTFTALTEKFNLPPGNYKKPKLLYCSNGGHFLRILPDGTVDGTRDRSDQHIQLQLSAESVGEVYIKSTETGQYLAMDTSGLLYGSQTPNEECLFLERLEENHEGKNDKPTDQSITPYFQQLNPGFSKAEEELEQHFTQYDVLDRMGRSCRDPAQDQQTLNKITLKFFKNEIHYRQKPIVDELRMQLDDLAKPRGLNTTSSYRDNILFFKDPRASNVKQEGIFQTVLRTFTGLNSSRNK"
    result = optimize(protein, "yeast")

    assert result["cai_after"] > 0.7
    assert translate(result["optimized_seq"]) == protein


def test_optimize_protein_input_human():
    protein = "ACDEFGHIKLMNPQRSTVWY"
    result = optimize(protein, "human")
    assert result["cai_after"] > 0.0
    assert translate(result["optimized_seq"]) == protein


# ── optimize: DNA (CDS) input ─────────────────────────────────── #
def test_optimize_cds_input_cai_improves():
    # E. coli suboptimal CDS — lots of rare codons
    # Manually built: each codon is the LEAST frequent for E. coli
    # L=CTA, G=GGA, K=AAG, ...  mix of rare codons
    rare_cds = (
        "ATG"          # M
        "CTACTAGTA"    # L L V  (CTA=rare, CTA=rare, GTA=rare in ecoli)
        "GCAGCAGCA"    # A A A  (GCA=less common than GCG in ecoli)
        "CGACGACGA"    # R R R  (CGA=rare in ecoli)
        "GGAGGAGGA"    # G G G  (GGA=rare vs GGC in ecoli)
        "TAA"          # stop
    )
    result = optimize(rare_cds, "ecoli")
    assert result["cai_after"] > result["cai_before"], (
        f"CAI should improve: before={result['cai_before']}, after={result['cai_after']}"
    )


def test_optimize_cds_protein_unchanged():
    # CDS that encodes MKAIFVLKGFVGFLAFCFSAG + stop — no internal stop codons
    # Manually verified: no TGA/TAA/TAG in frame
    cds = "ATGAAAGCAATTTTTGTTCTTAAAGGATTTGTTGGATTTTTGGCATTTCAAGCAGGATAA"
    # Verify there's no internal stop before translating
    protein_before = translate(cds).rstrip("*")
    assert len(protein_before) > 3

    result = optimize(cds, "ecoli")
    protein_after = translate(result["optimized_seq"]).rstrip("*")
    assert protein_before == protein_after


def test_optimize_changes_list_length():
    cds = "ATG" + "GGA" * 10 + "TAA"  # GGA is rare in E. coli vs GGC
    result = optimize(cds, "ecoli")
    # Expect most GGA→GGC changes reported
    assert len(result["changes"]) > 0


def test_optimize_codon_heatmap_shape():
    protein = "MACDEFGH"
    result = optimize(protein, "ecoli")
    assert len(result["codon_heatmap"]) == len(protein)
    for cell in result["codon_heatmap"]:
        assert 0.0 <= cell["w"] <= 1.0
        assert len(cell["codon"]) == 3


# ── avoid_sites ──────────────────────────────────────────────── #
def test_avoid_sites_removes_ecori():
    # Deliberately craft a sequence that contains EcoRI (GAATTC)
    # We'll encode a peptide where GAATTC appears in the CDS
    # GAATTC = E(GAA) + F(TTC) : Glu-Phe  (easy to make synonymous)
    # Original: GAA TTC → E. GAATTC present
    cds = "ATG" + "GAATTC" + "GGT" + "TAA"  # M-E-F-G-stop
    assert "GAATTC" in cds

    result = avoid_sites(cds, enzymes=["EcoRI"])
    assert "GAATTC" not in result["optimized_seq"]
    assert "EcoRI" in result["removed_sites"]

    # Protein must be unchanged
    orig_protein = translate(cds).rstrip("*")
    new_protein  = translate(result["optimized_seq"]).rstrip("*")
    assert orig_protein == new_protein


def test_avoid_sites_removes_bamhi():
    # BamHI = GGATCC  → G(GGA) T(ACC) overlaps two codons
    cds = "ATG" + "GGATCC" + "GGT" + "TAA"  # M-G-S-G-stop
    assert "GGATCC" in cds

    result = avoid_sites(cds, enzymes=["BamHI"])
    assert "GGATCC" not in result["optimized_seq"]
    assert "BamHI" in result["removed_sites"]

    orig_protein = translate(cds).rstrip("*")
    new_protein  = translate(result["optimized_seq"]).rstrip("*")
    assert orig_protein == new_protein


def test_avoid_sites_protein_invariant_multiple_sites():
    # Two sites at once
    cds = "ATG" + "GAATTC" + "GGT" + "GGATCC" + "TAA"
    result = avoid_sites(cds, enzymes=["EcoRI", "BamHI"])
    assert "GAATTC" not in result["optimized_seq"]
    assert "GGATCC" not in result["optimized_seq"]
    orig_protein = translate(cds).rstrip("*")
    new_protein  = translate(result["optimized_seq"]).rstrip("*")
    assert orig_protein == new_protein


def test_avoid_sites_empty_enzymes_still_runs():
    cds = "ATGGGTTAA"
    result = avoid_sites(cds, enzymes=[])
    # Should run without error (polyA/polyT still checked)
    assert result["optimized_seq"]


# ── gc_window_balance ────────────────────────────────────────── #
def test_gc_window_balance_lowers_high_gc():
    # All-GC codons: GGG GGG GGG ... GCG GCG GCG  (GC fraction ≫ 0.5)
    # Use Gly and Ala codons that are all GC-rich
    cds = "ATG" + "GGG" * 15 + "TAA"  # GGG = G (100% GC)
    gc_before = (cds.count("G") + cds.count("C")) / len(cds)
    assert gc_before > 0.65, "Test CDS should start with high GC"

    result = gc_window_balance(cds, target=0.50)
    opt = result["optimized_seq"]
    gc_after = (opt.count("G") + opt.count("C")) / len(opt)
    assert gc_after < gc_before, "GC should decrease toward target"


def test_gc_window_balance_protein_invariant():
    cds = "ATG" + "GGG" * 15 + "TAA"
    result = gc_window_balance(cds, target=0.50)
    orig_p = translate(cds).rstrip("*")
    new_p  = translate(result["optimized_seq"]).rstrip("*")
    assert orig_p == new_p


# ── CAI sanity ───────────────────────────────────────────────── #
def test_cai_fully_optimal_is_1():
    """A sequence using only the most-frequent E. coli codon per AA should CAI=1."""
    table = CODON_USAGE["ecoli"]
    # Build a CDS with the top codon for each of M, L, G, A, K, E
    top_codons = [
        max(_SYNONYMS["M"], key=lambda c: table.get(c, 0)),  # M
        max(_SYNONYMS["L"], key=lambda c: table.get(c, 0)),  # L
        max(_SYNONYMS["G"], key=lambda c: table.get(c, 0)),  # G
        max(_SYNONYMS["A"], key=lambda c: table.get(c, 0)),  # A
        max(_SYNONYMS["K"], key=lambda c: table.get(c, 0)),  # K
        max(_SYNONYMS["E"], key=lambda c: table.get(c, 0)),  # E
    ]
    cai = _calc_cai(top_codons, table)
    assert cai == pytest.approx(1.0), f"Fully optimal CAI should be 1.0, got {cai}"


def test_cai_range():
    result = optimize("MSKGEELFTG", "ecoli")
    assert 0.0 < result["cai_after"] <= 1.0


# ── Unknown host / AA guard ───────────────────────────────────── #
def test_unknown_host_raises():
    with pytest.raises(ValueError, match="Unknown host"):
        optimize("MSKGE", "banana")


def test_unknown_amino_acid_raises():
    with pytest.raises(ValueError, match="Unknown amino acid"):
        optimize("MSKBX", "ecoli")  # B and X are not standard AAs
