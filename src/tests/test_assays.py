"""Tests for the assay simulator core functions."""

import math

import pytest

from modules.assays import core


# ───────────────────────── helpers ──────────────────────────────────────── #

def _flat_reporter(value: float, n: int = 200) -> list[float]:
    """Synthetic reporter trace: rises to `value` over n points."""
    return [value * (1 - math.exp(-0.08 * t)) for t in range(n)]


# ───────────────────────── flow cytometry ────────────────────────────────── #

def test_flow_returns_required_keys():
    result = core.flow_cytometry(_flat_reporter(50.0), seed=0)
    assert "histogram" in result
    assert "percent_positive" in result
    assert "gate_threshold" in result
    assert "mean_fluorescence" in result
    assert len(result["histogram"]["bins"]) == len(result["histogram"]["counts"])


def test_flow_percent_positive_rises_with_induction():
    """Higher inducer → higher mean fluorescence → more cells above gate."""
    gate = 5.0
    low  = core.flow_cytometry(_flat_reporter(2.0),  gate_threshold=gate, seed=42)
    high = core.flow_cytometry(_flat_reporter(80.0), gate_threshold=gate, seed=42)
    assert high["percent_positive"] > low["percent_positive"], (
        f"Expected high induction %pos ({high['percent_positive']}) "
        f"> low induction %pos ({low['percent_positive']})"
    )


def test_flow_percent_positive_range():
    result = core.flow_cytometry(_flat_reporter(50.0), seed=1)
    assert 0.0 <= result["percent_positive"] <= 100.0


def test_flow_respects_gate_threshold():
    """Raising the gate should decrease or keep %positive the same."""
    vals = _flat_reporter(50.0)
    low_gate  = core.flow_cytometry(vals, gate_threshold=1.0,  seed=7)
    high_gate = core.flow_cytometry(vals, gate_threshold=50.0, seed=7)
    assert high_gate["percent_positive"] <= low_gate["percent_positive"]


def test_flow_n_cells_returned():
    result = core.flow_cytometry(_flat_reporter(30.0), n_cells=500, seed=0)
    assert result["n_cells"] == 500
    # Histogram covers up to p99.5, so a small number of outlier cells
    # may fall outside the bin range.
    total = sum(result["histogram"]["counts"])
    assert total <= 500 and total >= 490


def test_flow_empty_reporter_raises():
    with pytest.raises(ValueError, match="empty"):
        core.flow_cytometry([])


# ───────────────────────── plate reader ──────────────────────────────────── #

def test_plate_reader_keys():
    t = list(range(0, 201, 5))
    vals = _flat_reporter(40.0, len(t))
    result = core.plate_reader(t, vals)
    assert "wells" in result
    assert "dose_response" in result
    assert "t" in result


def test_plate_reader_fluorescence_monotonic_with_induction():
    """Higher inducer concentration → higher final fluorescence."""
    t = list(range(0, 201, 5))
    vals = _flat_reporter(40.0, len(t))
    result = core.plate_reader(t, vals, conditions=[0.1, 1.0, 10.0, 100.0])
    finals = [w["fluorescence"][-1] for w in result["wells"]]
    assert finals == sorted(finals), f"Fluorescence not monotone: {finals}"


def test_plate_reader_od_rises_to_saturation():
    """OD should be near max at the end of the time course."""
    t = list(range(0, 481, 5))  # 8 h course
    vals = _flat_reporter(30.0, len(t))
    result = core.plate_reader(t, vals, conditions=[5.0])
    od_end = result["wells"][0]["od"][-1]
    assert od_end > 1.0, f"OD at t_end should exceed 1.0, got {od_end}"


def test_plate_reader_n_conditions():
    t = list(range(0, 201, 5))
    vals = _flat_reporter(40.0, len(t))
    result = core.plate_reader(t, vals, n_conditions=8)
    assert len(result["wells"]) == 8


# ───────────────────────── qPCR ──────────────────────────────────────────── #

def test_qpcr_keys():
    result = core.qpcr([1e6, 1e4, 1e2])
    assert "cycles" in result
    assert "curves" in result
    assert "threshold" in result
    assert len(result["curves"]) == 3


def test_qpcr_ct_decreases_with_more_copies():
    """More starting copies → earlier amplification → lower Ct."""
    result = core.qpcr([1e2, 1e4, 1e6])
    cts = [c["ct"] for c in result["curves"]]
    assert cts == sorted(cts, reverse=True), f"Ct should decrease with copies: {cts}"


def test_qpcr_amplification_curve_sigmoid():
    """Fluorescence should start near 0, cross threshold, and saturate."""
    result = core.qpcr([1e4])
    fl = result["curves"][0]["fluorescence"]
    assert fl[0] < 100, "Fluorescence at cycle 1 should be near 0"
    assert fl[-1] > 9_000, "Fluorescence at cycle 40 should be near saturation"


# ───────────────────────── gel ────────────────────────────────────────────── #

def test_gel_returns_ladder_and_bands():
    result = core.gel([{"name": "A", "length": 500}])
    assert "ladder" in result and len(result["ladder"]) > 0
    assert "bands"  in result and len(result["bands"])  == 1


def test_gel_band_order_matches_length_order():
    """Larger fragments migrate less (lower position value) than smaller ones."""
    frags = [
        {"name": "small",  "length": 200},
        {"name": "medium", "length": 800},
        {"name": "large",  "length": 3000},
    ]
    result = core.gel(frags)
    positions = {b["name"]: b["position"] for b in result["bands"]}
    assert positions["small"] > positions["medium"] > positions["large"], (
        f"Expected small > medium > large positions, got {positions}"
    )


def test_gel_ladder_order_matches_length_order():
    """Ladder bands must also obey the same migration rule."""
    result = core.gel([])
    ladder = result["ladder"]
    sizes = [b["size"] for b in ladder]
    positions = [b["position"] for b in ladder]
    # Ladder is listed small→large; positions should be decreasing
    assert positions == sorted(positions, reverse=True), (
        f"Ladder positions not monotone decreasing with size: {list(zip(sizes, positions))}"
    )


def test_gel_band_positions_in_range():
    frags = [{"name": f"f{i}", "length": bp} for i, bp in enumerate([100, 500, 2000, 8000])]
    result = core.gel(frags)
    for b in result["bands"] + result["ladder"]:
        assert 0.0 <= b["position"] <= 100.0, f"Position out of range: {b}"
