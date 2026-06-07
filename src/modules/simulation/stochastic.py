"""Gillespie direct-method stochastic simulation (SSA).

Converts the Hill-kinetics ODE system into discrete propensity functions and
stoichiometry vectors.  Runs N trajectories and returns mean, p10, p90 bands,
and the noise index (CV at steady state).
"""

import math
from typing import Optional

import numpy as np

from modules.parts import library
from shared.schemas.schemas import (
    CompileResponse,
    IntentSpec,
    SimParams,
    StochasticRequest,
    StochasticSimulation,
    StochasticSeries,
)
from modules.compiler.rules import system_for_inducer
from modules.simulation.ode import (
    BETA_R, GAMMA_R, BETA_P, GAMMA_P, K, N, KI, I_MAX,
    _resolve, _step, _drive, _combine, _input_plan, HOST_CONSTANTS,
)


def _gillespie_single(
    spec: IntentSpec,
    cfg: dict,
    t_eval: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray:
    """Run one Gillespie trajectory and return reporter values sampled at t_eval."""
    p = spec.pattern
    t_end = cfg["t_end"]
    k, n_hill = cfg["k"], cfg["n"]
    beta_r, gamma_r = cfg["beta_r"], cfg["gamma_r"]
    beta_p, gamma_p = cfg["beta_p"], cfg["gamma_p"]
    i_max = cfg["i_max"]

    if p == "constitutive_expression":
        # State: [P]
        # Reactions: produce P (beta_p), degrade P (gamma_p * P)
        state = np.array([0], dtype=float)
        r0 = 0.0
        plan = []
    else:
        plan = _input_plan(spec)
        n_inputs = len(plan)
        r0 = beta_r / gamma_r
        state = np.array([r0] * n_inputs + [0.0])

    t = 0.0
    trajectory = []  # (t, reporter_value) samples

    eval_idx = 0
    n_eval = len(t_eval)
    reporter_out = np.zeros(n_eval)

    max_steps = 100_000  # safety cap per trajectory

    for _ in range(max_steps):
        if t >= t_end:
            break

        # Record output at scheduled eval times
        while eval_idx < n_eval and t_eval[eval_idx] <= t:
            if p == "constitutive_expression":
                reporter_out[eval_idx] = state[0]
            else:
                reporter_out[eval_idx] = state[-1]
            eval_idx += 1

        # Compute propensities
        if p == "constitutive_expression":
            P = max(state[0], 0.0)
            propensities = [beta_p, gamma_p * P]
            stoichiometry = [
                np.array([1.0]),   # produce P
                np.array([-1.0]),  # degrade P
            ]
        else:
            n_inputs = len(plan)
            regulators = state[:n_inputs]
            P = max(state[n_inputs], 0.0)

            drives = [
                _drive(inp["mode"], max(regulators[i], 0.0),
                       _step(t, inp["t_on"], inp["present"], i_max), k, n_hill)
                for i, inp in enumerate(plan)
            ]
            f = _combine(spec.pattern, drives)

            propensities = []
            stoichiometry = []
            for i in range(n_inputs):
                R = max(regulators[i], 0.0)
                propensities.append(beta_r)                   # produce regulator i
                propensities.append(gamma_r * R)              # degrade regulator i
                sv_prod = np.zeros(n_inputs + 1); sv_prod[i] = 1.0
                sv_deg  = np.zeros(n_inputs + 1); sv_deg[i] = -1.0
                stoichiometry.extend([sv_prod, sv_deg])

            propensities.append(beta_p * max(f, 0.0))        # produce reporter
            propensities.append(gamma_p * P)                  # degrade reporter
            sv_p_prod = np.zeros(n_inputs + 1); sv_p_prod[-1] = 1.0
            sv_p_deg  = np.zeros(n_inputs + 1); sv_p_deg[-1] = -1.0
            stoichiometry.extend([sv_p_prod, sv_p_deg])

        a0 = sum(propensities)
        if a0 <= 0:
            t = t_end
            break

        # Time to next reaction
        tau = -math.log(rng.random()) / a0
        t += tau

        # Choose reaction
        u2 = rng.random() * a0
        cumsum = 0.0
        chosen = len(propensities) - 1
        for j, a in enumerate(propensities):
            cumsum += a
            if cumsum >= u2:
                chosen = j
                break

        state = np.maximum(state + stoichiometry[chosen], 0.0)

    # Fill remaining eval points
    while eval_idx < n_eval:
        reporter_out[eval_idx] = state[0] if p == "constitutive_expression" else state[-1]
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

    rng = np.random.default_rng(seed=42)
    n_traj = req.n_trajectories

    all_traces = np.zeros((n_traj, N_POINTS))
    for i in range(n_traj):
        all_traces[i] = _gillespie_single(spec, cfg, t_eval, rng)

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
