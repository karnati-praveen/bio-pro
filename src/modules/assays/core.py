"""Assay simulator core: converts ODE/stochastic output into predicted wet-lab readouts.

Four assays are supported:
  flow_cytometry  – single-cell fluorescence histogram + %positive
  plate_reader    – OD + fluorescence time-courses across an inducer titration
  qpcr            – sigmoid amplification curves (Ct vs starting copies)
  gel             – band migration positions on a 1% agarose gel
"""

import math
from typing import Optional

import numpy as np

# Standard 1 % agarose ladder sizes (bp)
_LADDER_BP = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000]


def _gel_position(bp: int) -> float:
    """Return fractional gel position (0 = top/wells, 1 = far end/bottom).

    Linear in log10(bp), calibrated so 100 bp → 0.90 and 10 000 bp → 0.05.
    """
    return 0.90 - 0.85 * (math.log10(max(bp, 1)) - 2.0) / 2.0


# --------------------------------------------------------------------------- #
# Flow cytometry
# --------------------------------------------------------------------------- #

def flow_cytometry(
    reporter_values: list[float],
    n_cells: int = 1000,
    gate_threshold: Optional[float] = None,
    noise_cv: float = 0.35,
    seed: Optional[int] = None,
) -> dict:
    """Sample single-cell fluorescence from a log-normal distribution.

    The mean is the ODE steady-state reporter value (last 20 % of time points).
    The coefficient of variation parameterises cell-to-cell noise.

    Returns histogram bins/counts, %positive above the gate, gate value, and
    the mean fluorescence.
    """
    arr = np.asarray(reporter_values, dtype=float)
    if arr.size == 0:
        raise ValueError("reporter_values is empty")

    ss_start = max(1, int(0.8 * len(arr)))
    mean_fl = max(float(arr[ss_start:].mean()), 1e-9)

    # Log-normal parameterisation: given desired mean and CV
    sigma = math.sqrt(math.log(1.0 + noise_cv ** 2))
    mu = math.log(mean_fl) - 0.5 * sigma ** 2

    rng = np.random.default_rng(seed)
    cells = rng.lognormal(mean=mu, sigma=sigma, size=n_cells)

    p99 = float(np.percentile(cells, 99.5))
    max_bin = max(p99 * 1.1, 1.0)
    edges = np.linspace(0.0, max_bin, 51)
    counts, _ = np.histogram(cells, bins=edges)
    bin_centers = [
        round(float((edges[i] + edges[i + 1]) / 2), 4) for i in range(50)
    ]

    # Default gate: 10 % of the sampled fluorescence maximum — acts as an
    # autofluorescence proxy so that an uninduced circuit (low mean) still
    # falls mostly below this relative cutoff, while an induced circuit does not.
    gate = float(gate_threshold) if gate_threshold is not None else round(max_bin * 0.1, 4)
    pct_pos = round(float(np.mean(cells > gate)) * 100, 1)

    return {
        "histogram": {"bins": bin_centers, "counts": counts.tolist()},
        "percent_positive": pct_pos,
        "gate_threshold": round(gate, 4),
        "mean_fluorescence": round(mean_fl, 4),
        "n_cells": n_cells,
    }


# --------------------------------------------------------------------------- #
# Plate reader
# --------------------------------------------------------------------------- #

def plate_reader(
    t: list[float],
    reporter_values: list[float],
    conditions: Optional[list[float]] = None,
    n_conditions: int = 12,
    hill_k: float = 5.0,
    hill_n: float = 2.0,
) -> dict:
    """OD + fluorescence time-courses across an inducer titration.

    Fluorescence at each condition is derived from the reference simulation's
    peak value scaled by a Hill function.  OD follows logistic growth
    independent of induction level.
    """
    arr = np.asarray(reporter_values, dtype=float)
    t_arr = np.asarray(t, dtype=float)

    f_max = max(float(arr.max()), 1e-9)
    t_end = float(t_arr[-1]) if len(t_arr) > 0 else 200.0

    # First-order reporter degradation rate (matches ODE default GAMMA_P)
    gamma_p = 0.08

    if conditions is None:
        conditions = list(np.geomspace(0.1, 100.0, n_conditions))

    wells = []
    dose_response = []

    for conc in conditions:
        conc_f = float(conc)
        # Hill function activity [0, 1]
        hill = (conc_f ** hill_n) / (hill_k ** hill_n + conc_f ** hill_n)
        f_ss = f_max * hill

        # Fluorescence: exponential approach to steady state
        fl_curve = [
            round(float(f_ss * (1.0 - math.exp(-gamma_p * float(ti)))), 4)
            for ti in t_arr
        ]

        # OD: logistic growth (k≈0.07 min⁻¹ → doubling time ≈10 min at midpoint)
        od_max, k_grow, t_half = 1.2, 0.07, t_end * 0.35
        od_curve = [
            round(od_max / (1.0 + math.exp(-k_grow * (float(ti) - t_half))), 4)
            for ti in t_arr
        ]

        wells.append({
            "condition": round(conc_f, 4),
            "od": od_curve,
            "fluorescence": fl_curve,
        })
        dose_response.append({
            "condition": round(conc_f, 4),
            "final_fluorescence": fl_curve[-1] if fl_curve else 0.0,
        })

    return {
        "t": [round(float(ti), 2) for ti in t_arr],
        "wells": wells,
        "dose_response": dose_response,
        "n_conditions": len(conditions),
    }


# --------------------------------------------------------------------------- #
# qPCR
# --------------------------------------------------------------------------- #

def qpcr(copy_estimates: list[float]) -> dict:
    """Synthetic PCR amplification curves (cycle number vs fluorescence).

    Uses a two-parameter logistic model:
        F(n) = F_max / (1 + exp(−k·(n − Ct)))

    Standard efficiency: Ct ≈ 35 − log10(copies) × 3.32
    (i.e. one decade of starting copies shifts Ct by ~3.32 cycles).
    """
    cycles = list(range(1, 41))
    f_max = 10_000.0
    k_sigmoid = 1.0
    threshold = 500.0

    curves = []
    for copies in copy_estimates:
        ct_theory = max(5.0, min(38.0, 35.0 - math.log10(max(float(copies), 1.0)) * 3.32))
        fl = [
            round(f_max / (1.0 + math.exp(-k_sigmoid * (c - ct_theory))), 2)
            for c in cycles
        ]

        # Observed Ct: linear interpolation across threshold crossing
        ct_obs = ct_theory
        for i in range(len(fl) - 1):
            if fl[i] < threshold <= fl[i + 1]:
                frac = (threshold - fl[i]) / (fl[i + 1] - fl[i])
                ct_obs = cycles[i] + frac
                break

        # Human-readable label
        exp = int(math.floor(math.log10(max(float(copies), 1.0))))
        mantissa = float(copies) / (10 ** exp)
        if abs(mantissa - 1.0) < 0.05:
            label = f"10^{exp}"
        else:
            label = f"{mantissa:.1f}×10^{exp}"

        curves.append({
            "copies": float(copies),
            "label": label,
            "ct": round(ct_obs, 2),
            "fluorescence": fl,
        })

    return {
        "cycles": cycles,
        "curves": curves,
        "threshold": threshold,
    }


# --------------------------------------------------------------------------- #
# Gel electrophoresis
# --------------------------------------------------------------------------- #

def gel(fragments: list[dict]) -> dict:
    """Predicted band positions on a 1 % agarose gel.

    Position 0 = top (wells), 100 = bottom (farthest migration).
    Smaller fragments migrate farther and therefore have a higher position value.
    """
    ladder = [
        {"size": bp, "position": round(_gel_position(bp) * 100, 1)}
        for bp in _LADDER_BP
    ]

    bands = []
    for frag in fragments:
        bp = int(frag.get("length", frag.get("size", 0)))
        name = str(frag.get("name", f"{bp} bp"))
        pos = round(_gel_position(bp) * 100, 1)
        bands.append({"name": name, "length": bp, "position": pos})

    return {
        "ladder": ladder,
        "bands": bands,
    }
