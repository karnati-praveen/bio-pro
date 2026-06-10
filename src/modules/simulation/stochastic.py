"""Gillespie direct-method stochastic simulation (SSA).

Converts the Hill-kinetics ODE system into discrete propensity functions and
stoichiometry vectors.  Runs N trajectories and returns mean, p10, p90 bands,
and the noise index (CV at steady state).

Molecule-scaling convention (Omega)
-------------------------------------
ODE state variables are in arbitrary concentration units (a.u.).  The SSA
operates in discrete molecule counts using a system-size parameter Omega:

    N_molecules = concentration_au × Omega

Zeroth-order (production) propensities are multiplied by Omega so they
represent the rate of producing individual molecules:

    a_prod = rate_au × Omega

First-order (degradation) propensities use the molecule count directly:

    a_deg  = gamma × N_molecules

At steady state the SSA molecule count satisfies:

    <N_ss> = rate_au × Omega / gamma

which divided by Omega gives the same steady-state concentration as the ODE,
ensuring ODE mean and SSA mean overlay correctly when plotted together.

Noise scales as 1/sqrt(<N_ss>) (Poisson statistics), so increasing Omega
reduces stochastic fluctuations.  The default Omega for E. coli is 20
(≈ 20 molecules per a.u.); it scales proportionally with cell volume for
yeast (×42) and mammalian (×2000) hosts.

Step-count budget
-----------------
The Gillespie step budget is set adaptively:

    max_steps ≈ t_end × 2 × beta_p × Omega × 1.5  (minimum 100 000)

so trajectories can reach t_end at any Omega value without needing
hand-tuning.  A hard ceiling of 2 000 000 keeps runtime safe for large Omega.
"""

import math
from typing import Optional

import numpy as np

from modules.parts import library
from shared.schemas.schemas import (
    CompileResponse,
    IntentSpec,
    StochasticRequest,
    StochasticSimulation,
    StochasticSeries,
)
from modules.simulation.ode import (
    _resolve, _step, _drive, _combine, _input_plan, HOST_CONSTANTS,
)

# Base system size for E. coli: 20 molecules per a.u.  Scales with cell volume.
_OMEGA_ECOLI = 20.0


def _default_omega(organism: Optional[str]) -> float:
    """Return host-appropriate default Omega, scaled by cell volume vs E. coli."""
    hc = HOST_CONSTANTS.get(organism or "ecoli", HOST_CONSTANTS["ecoli"])
    ecoli_vol = HOST_CONSTANTS["ecoli"]["cell_volume_L"]
    return _OMEGA_ECOLI * hc["cell_volume_L"] / ecoli_vol


def _gillespie_single(
    spec: IntentSpec,
    cfg: dict,
    t_eval: np.ndarray,
    rng: np.random.Generator,
    omega: float,
) -> np.ndarray:
    """Run one Gillespie trajectory; return reporter concentrations (a.u.) at t_eval.

    State is tracked in molecule counts (N = concentration × omega).  Dividing
    by omega on output restores AU units so the SSA mean overlays the ODE trace.

    Stoichiometry is pre-allocated outside the hot loop to avoid per-step numpy
    array creation, which dominates runtime when step counts are large.
    """
    p = spec.pattern
    t_end = cfg["t_end"]
    k, n_hill = cfg["k"], cfg["n"]
    beta_r, gamma_r = cfg["beta_r"], cfg["gamma_r"]
    beta_p, gamma_p = cfg["beta_p"], cfg["gamma_p"]
    i_max = cfg["i_max"]

    if p == "constitutive_expression":
        n_state = 1
        n_react = 2
        plan = []
    else:
        plan = _input_plan(spec, cfg)
        n_inputs = len(plan)
        n_state = n_inputs + 1
        n_react = 2 * n_inputs + 2

    # Pre-allocate stoichiometry matrix (n_reactions × n_state).
    # Each row is the integer change to the state vector for that reaction.
    # Precomputing avoids numpy allocations inside the O(max_steps) hot loop.
    stoich = np.zeros((n_react, n_state))
    if p == "constitutive_expression":
        stoich[0, 0] = 1.0    # produce P
        stoich[1, 0] = -1.0   # degrade P
    else:
        for i in range(n_inputs):
            stoich[2 * i,     i] = 1.0   # produce regulator i
            stoich[2 * i + 1, i] = -1.0  # degrade regulator i
        stoich[-2, n_inputs] = 1.0        # produce reporter
        stoich[-1, n_inputs] = -1.0       # degrade reporter

    # Initial state (molecule counts)
    state = np.zeros(n_state)
    if p != "constitutive_expression":
        r0_mol = (beta_r / gamma_r) * omega
        state[:n_inputs] = r0_mol

    # Pre-compute constant production propensities (× omega, zeroth-order)
    prod_beta_r = beta_r * omega         # regulator production (same for all inputs)
    t_ons    = [inp["t_on"]   for inp in plan]
    presents = [inp["present"] for inp in plan]
    modes    = [inp["mode"]   for inp in plan]

    # Adaptive step budget: enough steps to reach t_end at this Omega.
    expected_propensity = 2.0 * beta_p * omega
    max_steps = min(int(t_end * expected_propensity * 1.5) + 100_000, 2_000_000)

    t = 0.0
    eval_idx = 0
    n_eval = len(t_eval)
    reporter_out = np.zeros(n_eval)
    reporter_col = 0 if p == "constitutive_expression" else n_inputs

    propensities = np.zeros(n_react)

    for _ in range(max_steps):
        if t >= t_end:
            break

        # Record reporter concentration (molecule count ÷ omega) at eval times
        while eval_idx < n_eval and t_eval[eval_idx] <= t:
            reporter_out[eval_idx] = state[reporter_col] / omega
            eval_idx += 1

        # Compute propensities for this time step
        if p == "constitutive_expression":
            N_P = state[0] if state[0] > 0.0 else 0.0
            propensities[0] = beta_p * omega   # production (zeroth-order × Omega)
            propensities[1] = gamma_p * N_P    # degradation (first-order × count)
        else:
            N_P = state[n_inputs] if state[n_inputs] > 0.0 else 0.0
            R_concs = state[:n_inputs] / omega  # convert to AU for Hill functions

            drives = [
                _drive(modes[i], max(R_concs[i], 0.0),
                       _step(t, t_ons[i], presents[i], i_max), k, n_hill)
                for i in range(n_inputs)
            ]
            f = max(_combine(p, drives), 0.0)

            for i in range(n_inputs):
                N_R = state[i] if state[i] > 0.0 else 0.0
                propensities[2 * i]     = prod_beta_r    # production
                propensities[2 * i + 1] = gamma_r * N_R  # degradation
            propensities[-2] = beta_p * f * omega  # reporter production
            propensities[-1] = gamma_p * N_P       # reporter degradation

        a0 = propensities.sum()
        if a0 <= 0:
            t = t_end
            break

        tau = -math.log(rng.random()) / a0
        t += tau

        # Choose reaction by cumulative-sum method
        u2 = rng.random() * a0
        cumsum = 0.0
        chosen = n_react - 1
        for j in range(n_react):
            cumsum += propensities[j]
            if cumsum >= u2:
                chosen = j
                break

        state = np.maximum(state + stoich[chosen], 0.0)

    # Fill remaining eval points with last simulated state
    while eval_idx < n_eval:
        reporter_out[eval_idx] = state[reporter_col] / omega
        eval_idx += 1

    return reporter_out


def run_stochastic(req: StochasticRequest) -> StochasticSimulation:
    """Run N Gillespie trajectories and return statistics."""
    result: CompileResponse = req.compile_result
    spec = result.spec
    cfg = _resolve(None, spec.organism)
    t_end = cfg["t_end"]

    from modules.simulation.ode import N_POINTS
    t_eval = np.linspace(0.0, t_end, N_POINTS)

    omega = req.omega if req.omega is not None else _default_omega(spec.organism)
    rng = np.random.default_rng(seed=req.seed)
    n_traj = req.n_trajectories

    all_traces = np.zeros((n_traj, N_POINTS))
    for i in range(n_traj):
        all_traces[i] = _gillespie_single(spec, cfg, t_eval, rng, omega)

    mean_traj = np.mean(all_traces, axis=0)
    p10_traj  = np.percentile(all_traces, 10, axis=0)
    p90_traj  = np.percentile(all_traces, 90, axis=0)

    # Noise index: CV at final 20% of time (approximate steady state)
    ss_start = int(0.8 * N_POINTS)
    ss_vals = all_traces[:, ss_start:].ravel()
    mean_ss = np.mean(ss_vals)
    std_ss  = np.std(ss_vals)
    noise_index = float(std_ss / mean_ss) if mean_ss > 0 else 0.0

    # Probability above threshold at t_end
    final_vals = all_traces[:, -1]
    threshold = req.threshold
    prob_above: Optional[float] = None
    if threshold is not None:
        prob_above = float(np.mean(final_vals > threshold))

    output_part = library.get_part(spec.output) or {}
    reporter_series = StochasticSeries(
        name=spec.output,
        mean=[round(float(v), 4) for v in mean_traj],
        p10=[round(float(v), 4) for v in p10_traj],
        p90=[round(float(v), 4) for v in p90_traj],
        trajectories=[[round(float(v), 3) for v in row] for row in all_traces],
        cv_steady_state=round(noise_index, 4),
        prob_above_threshold=round(prob_above, 4) if prob_above is not None else None,
        color=output_part.get("color"),
        is_reporter=True,
    )

    return StochasticSimulation(
        t=[round(float(t), 3) for t in t_eval],
        series=[reporter_series],
        n_trajectories=n_traj,
        noise_index=round(noise_index, 4),
    )
