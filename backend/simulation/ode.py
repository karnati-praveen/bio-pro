"""ODE simulation: Hill-kinetics models for all 15 circuit patterns + parameter sweep.

Host-specific constants scale transcription/translation/dilution rates.
"""

from typing import Optional

import numpy as np
from scipy.integrate import solve_ivp

from models import library
from models.schemas import IntentSpec, Simulation, Series, SimParams, SweepRequest, SweepResponse, SweepCurve
from compiler.rules import system_for_inducer, REPRESSILATOR, TOGGLE_SWITCH

# --------------------------------------------------------------------------- #
# Default kinetic parameters (arbitrary units, E. coli-scale)
# --------------------------------------------------------------------------- #
BETA_R = 4.0      # regulator production rate
GAMMA_R = 0.1     # regulator degradation + dilution
BETA_P = 10.0     # max reporter production rate
GAMMA_P = 0.08    # reporter degradation + dilution
K = 10.0          # Hill half-max constant
N = 2             # Hill coefficient
KI = 1.0          # inducer binding constant (for sequestration)
M = 1             # inducer cooperativity
I_MAX = 5.0       # inducer level once switched on

T_END = 200.0
N_POINTS = 200

# --------------------------------------------------------------------------- #
# Host-specific simulation constants
# --------------------------------------------------------------------------- #
HOST_CONSTANTS: dict[str, dict] = {
    "ecoli": {
        "cell_volume_L": 1e-15,
        "doubling_time_min": 30,
        "transcription_rate_nt_per_sec": 50,
        "translation_rate_aa_per_sec": 40,
        "dilution_rate": 0.023,     # ln(2)/30 min
        "beta_r_scale": 1.0,
        "beta_p_scale": 1.0,
        "gamma_scale": 1.0,
        "t_end": 200.0,
    },
    "yeast": {
        "cell_volume_L": 42e-15,
        "doubling_time_min": 90,
        "transcription_rate_nt_per_sec": 25,
        "translation_rate_aa_per_sec": 10,
        "dilution_rate": 0.0077,    # ln(2)/90 min
        "beta_r_scale": 0.5,
        "beta_p_scale": 0.6,
        "gamma_scale": 0.4,
        "t_end": 600.0,
    },
    "mammalian": {
        "cell_volume_L": 2000e-15,
        "doubling_time_min": 1440,
        "transcription_rate_nt_per_sec": 30,
        "translation_rate_aa_per_sec": 6,
        "dilution_rate": 0.00048,   # ln(2)/1440 min
        "beta_r_scale": 0.3,
        "beta_p_scale": 0.4,
        "gamma_scale": 0.05,
        "t_end": 4000.0,
    },
}


def _host_cfg(organism: Optional[str]) -> dict:
    return HOST_CONSTANTS.get(organism or "ecoli", HOST_CONSTANTS["ecoli"])


def _resolve(params: Optional[SimParams], organism: Optional[str] = None) -> dict:
    p = params or SimParams()
    hc = _host_cfg(organism)
    t_end = p.duration if getattr(p, "duration", None) else hc["t_end"]
    return {
        "beta_p": (p.beta_p if p.beta_p is not None else BETA_P) * hc["beta_p_scale"],
        "gamma_p": (p.gamma_p if p.gamma_p is not None else GAMMA_P) * hc["gamma_scale"],
        "k": p.k if p.k is not None else K,
        "n": p.n if p.n is not None else N,
        "i_max": p.i_max if p.i_max is not None else I_MAX,
        "beta_r": BETA_R * hc["beta_r_scale"],
        "gamma_r": GAMMA_R * hc["gamma_scale"],
        "t_end": t_end,
    }


def _step(t: float, t_on: float, present: bool, i_max: float) -> float:
    if not present:
        return 0.0
    return i_max if t >= t_on else 0.0


def _drive(mode: str, R: float, inducer: float, k: float, n: float) -> float:
    R = max(R, 0.0)
    if mode == "derepress":
        r_free = R / (1.0 + (inducer / KI) ** M)
        return 1.0 / (1.0 + (r_free / k) ** n)
    a_active = R * (inducer / KI) / (1.0 + inducer / KI)
    ratio = (a_active / k) ** n
    return ratio / (1.0 + ratio)


def _combine(pattern: str, drives: list[float]) -> float:
    if pattern == "logic_and":
        return drives[0] * drives[1]
    if pattern == "logic_or":
        return 1.0 - (1.0 - drives[0]) * (1.0 - drives[1])
    if pattern == "logic_nand":
        return 1.0 - drives[0] * drives[1]
    if pattern == "logic_nor":
        return (1.0 - drives[0]) * (1.0 - drives[1])
    if pattern == "combinatorial_logic":
        f = 1.0
        for d in drives:
            f *= d
        return f
    return drives[0]


def _input_plan(spec: IntentSpec) -> list[dict]:
    n = len(spec.triggers)
    plan = []
    for idx, trig in enumerate(spec.triggers):
        system = system_for_inducer(trig.inducer)
        if system is None:
            raise ValueError(f"No inducible system for '{trig.inducer}'.")
        t_end = HOST_CONSTANTS.get(spec.organism or "ecoli", HOST_CONSTANTS["ecoli"])["t_end"]
        t_on = t_end / 3.0 if n == 1 else t_end * (idx + 1) / 4.0
        plan.append({
            "inducer": trig.inducer,
            "mode": system["mode"],
            "regulator": system["regulator"],
            "present": trig.presence == "present",
            "t_on": t_on,
        })
    return plan


# --------------------------------------------------------------------------- #
# Per-pattern ODE builders
# --------------------------------------------------------------------------- #
def _simulate_standard(spec: IntentSpec, cfg: dict) -> tuple:
    """Standard inducible/gate patterns. Returns (sol, t_eval, plan, n_inputs)."""
    plan = _input_plan(spec)
    n_inputs = len(plan)
    t_end = cfg["t_end"]

    if n_inputs >= 1:
        promoter = library.get_part(system_for_inducer(plan[0]["inducer"])["promoter"])
        strength = float(promoter.get("strength", 1.0)) if promoter else 1.0
    else:
        strength = 1.0

    def rhs(t, y):
        regulators = y[:n_inputs]
        P = y[n_inputs]
        drives = [
            _drive(inp["mode"], R, _step(t, inp["t_on"], inp["present"], cfg["i_max"]),
                   cfg["k"], cfg["n"])
            for inp, R in zip(plan, regulators)
        ]
        f = _combine(spec.pattern, drives)
        dR = [cfg["beta_r"] - cfg["gamma_r"] * max(R, 0.0) for R in regulators]
        dP = cfg["beta_p"] * strength * f - cfg["gamma_p"] * P
        return [*dR, dP]

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    r0 = cfg["beta_r"] / cfg["gamma_r"]
    y0 = [r0] * n_inputs + [0.0]
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45", rtol=1e-6, atol=1e-8)
    return sol, t_eval, plan, n_inputs


def _simulate_constitutive(spec: IntentSpec, cfg: dict) -> Simulation:
    t_end = cfg["t_end"]
    t_eval = np.linspace(0.0, t_end, N_POINTS)

    def rhs(t, y):
        P = y[0]
        return [cfg["beta_p"] - cfg["gamma_p"] * P]

    sol = solve_ivp(rhs, (0.0, t_end), y0=[0.0], t_eval=t_eval, method="RK45")
    output_part = library.get_part(spec.output) or {}
    series = [Series(
        name=spec.output, values=[round(float(v), 4) for v in sol.y[0]],
        color=output_part.get("color"), is_reporter=True,
    )]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_toggle_switch(spec: IntentSpec, cfg: dict) -> Simulation:
    """Bistable toggle switch ODE: two mutually repressing genes."""
    # State: [cI, cI434]  — reporter tracks cI arm (arm1)
    t_end = cfg["t_end"]
    k, n = cfg["k"], cfg["n"]
    beta_r, gamma_r = cfg["beta_r"], cfg["gamma_r"]

    def rhs(t, y):
        cI, cI434 = max(y[0], 0.0), max(y[1], 0.0)
        # arm1 (cI) expressed from pCI; repressed by cI434
        d_cI434_on_pCI = 1.0 / (1.0 + (cI434 / k) ** n)
        # arm2 (cI434) expressed from pCI434; repressed by cI
        d_cI_on_pCI434 = 1.0 / (1.0 + (cI / k) ** n)
        dcI = beta_r * d_cI434_on_pCI - gamma_r * cI
        dcI434 = beta_r * d_cI_on_pCI434 - gamma_r * cI434
        return [dcI, dcI434]

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    # Slightly perturbed initial condition to break symmetry → settles into one state
    y0 = [cfg["beta_r"] / cfg["gamma_r"] * 1.1, cfg["beta_r"] / cfg["gamma_r"] * 0.9]
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45")

    # Report cI (arm1) concentration as a proxy for the toggle state
    output_part = library.get_part(spec.output) or {}
    toggle_val = [cfg["beta_p"] * v / (v + k) for v in sol.y[0]]  # activation by cI arm

    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in toggle_val],
               color=output_part.get("color"), is_reporter=True),
        Series(name="cI (arm 1)", values=[round(float(v), 4) for v in sol.y[0]], color="#457b9d"),
        Series(name="cI434 (arm 2)", values=[round(float(v), 4) for v in sol.y[1]], color="#1d3557"),
    ]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_negative_feedback(spec: IntentSpec, cfg: dict) -> Simulation:
    """Negative feedback: output represses its own promoter drive."""
    t_end = cfg["t_end"]
    k, n = cfg["k"], cfg["n"]

    if spec.triggers:
        plan = _input_plan(spec)
        t_on = plan[0]["t_on"]
        present = plan[0]["present"]
        mode = plan[0]["mode"]
        reg = cfg["beta_r"] / cfg["gamma_r"]  # steady-state regulator

        def rhs(t, y):
            R, P = max(y[0], 0.0), max(y[1], 0.0)
            inducer = _step(t, t_on, present, cfg["i_max"])
            d_up = _drive(mode, R, inducer, k, n)       # induction drive
            d_fb = 1.0 / (1.0 + (P / k) ** n)           # self-repression
            dR = cfg["beta_r"] - cfg["gamma_r"] * R
            dP = cfg["beta_p"] * d_up * d_fb - cfg["gamma_p"] * P
            return [dR, dP]

        r0 = cfg["beta_r"] / cfg["gamma_r"]
        y0 = [r0, 0.0]
        n_state = 2
    else:
        def rhs(t, y):
            P = max(y[0], 0.0)
            d_fb = 1.0 / (1.0 + (P / k) ** n)
            return [cfg["beta_p"] * d_fb - cfg["gamma_p"] * P]
        y0 = [0.0]
        n_state = 1

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45")

    output_part = library.get_part(spec.output) or {}
    reporter_idx = n_state - 1
    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in sol.y[reporter_idx]],
               color=output_part.get("color"), is_reporter=True),
    ]
    if n_state == 2:
        reg_part = library.get_part(spec.triggers[0].inducer) or {}
        series.append(Series(name="Regulator", values=[round(float(v), 4) for v in sol.y[0]]))
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_positive_feedback(spec: IntentSpec, cfg: dict) -> Simulation:
    """Positive feedback: output activates its own promoter (bistable switch-like)."""
    t_end = cfg["t_end"]
    k, n = cfg["k"], cfg["n"]

    if spec.triggers:
        plan = _input_plan(spec)
        t_on = plan[0]["t_on"]
        present = plan[0]["present"]
        mode = plan[0]["mode"]

        def rhs(t, y):
            R, P = max(y[0], 0.0), max(y[1], 0.0)
            inducer = _step(t, t_on, present, cfg["i_max"])
            d_up = _drive(mode, R, inducer, k, n)
            d_fb = (P / k) ** n / (1.0 + (P / k) ** n)   # self-activation
            dR = cfg["beta_r"] - cfg["gamma_r"] * R
            dP = cfg["beta_p"] * (0.05 + d_up + d_fb) - cfg["gamma_p"] * P
            return [dR, dP]

        r0 = cfg["beta_r"] / cfg["gamma_r"]
        y0 = [r0, 0.0]
        n_state = 2
    else:
        def rhs(t, y):
            P = max(y[0], 0.0)
            d_fb = (P / k) ** n / (1.0 + (P / k) ** n)
            return [cfg["beta_p"] * (0.05 + d_fb) - cfg["gamma_p"] * P]
        y0 = [0.0]
        n_state = 1

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45")

    output_part = library.get_part(spec.output) or {}
    reporter_idx = n_state - 1
    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in sol.y[reporter_idx]],
               color=output_part.get("color"), is_reporter=True),
    ]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_ffl(spec: IntentSpec, cfg: dict) -> Simulation:
    """Coherent FFL: inducer → regulator → output AND inducer → output (two paths)."""
    if not spec.triggers:
        return _simulate_constitutive(spec, cfg)

    plan = _input_plan(spec)
    t_on = plan[0]["t_on"]
    present = plan[0]["present"]
    mode = plan[0]["mode"]
    k, n = cfg["k"], cfg["n"]
    t_end = cfg["t_end"]

    def rhs(t, y):
        R, P = max(y[0], 0.0), max(y[1], 0.0)
        inducer = _step(t, t_on, present, cfg["i_max"])
        d1 = _drive(mode, R, inducer, k, n)          # path 1: inducer → regulator → output
        # Path 2: regulator directly activates output (coherent FFL - sign-sensitive delay)
        d2 = (R / k) ** n / (1.0 + (R / k) ** n)
        f = 0.5 * d1 + 0.5 * d1 * d2                # coherent type-1: AND-like with delay
        dR = cfg["beta_r"] - cfg["gamma_r"] * R
        dP = cfg["beta_p"] * f - cfg["gamma_p"] * P
        return [dR, dP]

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    r0 = cfg["beta_r"] / cfg["gamma_r"]
    y0 = [r0, 0.0]
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45")

    output_part = library.get_part(spec.output) or {}
    reg_part = library.get_part(plan[0]["regulator"]) or {}
    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in sol.y[1]],
               color=output_part.get("color"), is_reporter=True),
        Series(name=plan[0]["regulator"],
               values=[round(float(v), 4) for v in sol.y[0]], color=reg_part.get("color")),
    ]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_band_pass(spec: IntentSpec, cfg: dict) -> Simulation:
    """Band-pass: low repressor activates output; high inducer also produces high repressor."""
    if not spec.triggers:
        return _simulate_constitutive(spec, cfg)

    plan = _input_plan(spec)
    t_on = plan[0]["t_on"]
    present = plan[0]["present"]
    mode = plan[0]["mode"]
    k, n = cfg["k"], cfg["n"]
    t_end = cfg["t_end"]

    # Sweep inducer from 0 to I_MAX over time (ramp) to see band-pass behaviour
    def rhs(t, y):
        R, H, P = max(y[0], 0.0), max(y[1], 0.0), max(y[2], 0.0)
        inducer_ramp = cfg["i_max"] * min(t / t_end * 2.0, 1.0) if present else 0.0
        d_low = _drive(mode, R, inducer_ramp, k, n)         # main activation
        d_high = (H / k) ** n / (1.0 + (H / k) ** n)       # high-dose repression
        f = d_low * (1.0 - d_high)                           # band-pass
        dR = cfg["beta_r"] - cfg["gamma_r"] * R
        dH = cfg["beta_p"] * 0.3 * d_low - cfg["gamma_p"] * H   # high-dose repressor accumulates
        dP = cfg["beta_p"] * f - cfg["gamma_p"] * P
        return [dR, dH, dP]

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    r0 = cfg["beta_r"] / cfg["gamma_r"]
    y0 = [r0, 0.0, 0.0]
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45")

    output_part = library.get_part(spec.output) or {}
    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in sol.y[2]],
               color=output_part.get("color"), is_reporter=True),
        Series(name="Activation arm", values=[round(float(v), 4) for v in sol.y[0]]),
        Series(name="Repression arm", values=[round(float(v), 4) for v in sol.y[1]], color="#e63946"),
    ]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


def _simulate_repressilator(spec: IntentSpec, cfg: dict) -> Simulation:
    """Repressilator: 3-gene ring producing sustained oscillations."""
    t_end = cfg["t_end"]
    k, n = cfg["k"], cfg["n"]
    beta_r, gamma_r = cfg["beta_r"], cfg["gamma_r"]
    beta_p, gamma_p = cfg["beta_p"], cfg["gamma_p"]

    # State: [LacI, TetR, cI, Reporter]
    # Ring: cI ⊣ pLac→LacI; LacI ⊣ pTet→TetR; TetR ⊣ pCI→cI
    def rhs(t, y):
        lacI, tetR, cI_p, P = [max(v, 0.0) for v in y]
        d_lacI = 1.0 / (1.0 + (cI_p / k) ** n)   # cI represses LacI expression
        d_tetR = 1.0 / (1.0 + (lacI / k) ** n)   # LacI represses TetR expression
        d_cI   = 1.0 / (1.0 + (tetR / k) ** n)   # TetR represses cI expression
        d_reporter = 1.0 / (1.0 + (cI_p / k) ** n)  # reporter driven from pLac
        dLacI = beta_r * d_lacI - gamma_r * lacI
        dTetR = beta_r * d_tetR - gamma_r * tetR
        dcI   = beta_r * d_cI   - gamma_r * cI_p
        dP    = beta_p * d_reporter - gamma_p * P
        return [dLacI, dTetR, dcI, dP]

    t_eval = np.linspace(0.0, t_end, N_POINTS)
    r0 = beta_r / gamma_r
    # Perturbed initial condition to seed oscillations
    y0 = [r0, r0 * 0.5, r0 * 0.1, 0.0]
    sol = solve_ivp(rhs, (0.0, t_end), y0=y0, t_eval=t_eval, method="RK45", rtol=1e-7, atol=1e-9)

    output_part = library.get_part(spec.output) or {}
    series = [
        Series(name=spec.output, values=[round(float(v), 4) for v in sol.y[3]],
               color=output_part.get("color"), is_reporter=True),
        Series(name="LacI", values=[round(float(v), 4) for v in sol.y[0]], color="#8ecae6"),
        Series(name="TetR",  values=[round(float(v), 4) for v in sol.y[1]], color="#219ebc"),
        Series(name="cI",    values=[round(float(v), 4) for v in sol.y[2]], color="#457b9d"),
    ]
    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def simulate(spec: IntentSpec, params: Optional[SimParams] = None) -> Simulation:
    """Run the appropriate ODE model for a parsed IntentSpec."""
    cfg = _resolve(params, spec.organism)
    p = spec.pattern

    if p == "constitutive_expression":
        return _simulate_constitutive(spec, cfg)
    if p == "toggle_switch":
        return _simulate_toggle_switch(spec, cfg)
    if p == "negative_feedback":
        return _simulate_negative_feedback(spec, cfg)
    if p == "positive_feedback":
        return _simulate_positive_feedback(spec, cfg)
    if p == "feed_forward_loop":
        return _simulate_ffl(spec, cfg)
    if p == "band_pass_filter":
        return _simulate_band_pass(spec, cfg)
    if p == "oscillator":
        return _simulate_repressilator(spec, cfg)

    # Standard inducible / gate patterns
    sol, t_eval, plan, n_inputs = _simulate_standard(spec, cfg)

    output_part = library.get_part(spec.output) or {}
    series = [
        Series(
            name=spec.output,
            values=[round(float(v), 4) for v in sol.y[n_inputs]],
            color=output_part.get("color"),
            is_reporter=True,
        )
    ]
    for idx, inp in enumerate(plan):
        reg_part = library.get_part(inp["regulator"]) or {}
        series.append(Series(
            name=inp["regulator"],
            values=[round(float(v), 4) for v in sol.y[idx]],
            color=reg_part.get("color"),
        ))
    for inp in plan:
        inducer_part = library.get_part(inp["inducer"]) or {}
        trace_vals = [_step(t, inp["t_on"], inp["present"], cfg["i_max"]) for t in t_eval]
        series.append(Series(
            name=f"{inp['inducer']} (input)",
            values=[round(float(v), 4) for v in trace_vals],
            color=inducer_part.get("color"),
        ))

    return Simulation(t=[round(float(t), 3) for t in t_eval], series=series)


# --------------------------------------------------------------------------- #
# Parameter sweep
# --------------------------------------------------------------------------- #
_ALL_PARAMS = ["beta_p", "gamma_p", "k", "n", "i_max"]


def _reporter_peak(values: list[float]) -> float:
    return max(values) if values else 0.0


def sweep(req: SweepRequest) -> SweepResponse:
    """Sweep one kinetic parameter over [min_val, max_val] and return all reporter curves."""
    from models.schemas import CompileResponse
    result: CompileResponse = req.compile_result
    spec = result.spec

    param = req.parameter
    if param not in _ALL_PARAMS:
        raise ValueError(f"Unknown sweep parameter '{param}'. Choose from: {_ALL_PARAMS}")

    values = np.linspace(req.min_val, req.max_val, req.steps)
    curves: list[SweepCurve] = []
    t_ref: list[float] = []

    for v in values:
        override: dict[str, float] = {param: float(v)}
        sim_params = SimParams(**override)
        sim = simulate(spec, sim_params)
        if not t_ref:
            t_ref = sim.t
        reporter = next((s for s in sim.series if s.is_reporter), sim.series[0])
        curves.append(SweepCurve(param_value=float(v), values=reporter.values))

    # Sensitivity score: % change in peak output per % change in parameter
    peak_lo = _reporter_peak(curves[0].values)
    peak_hi = _reporter_peak(curves[-1].values)
    param_lo = float(values[0])
    param_hi = float(values[-1])
    if peak_lo > 0 and param_lo > 0:
        sensitivity = abs((peak_hi - peak_lo) / peak_lo) / abs((param_hi - param_lo) / param_lo)
    else:
        sensitivity = 0.0

    # Quick sensitivity ranking across all parameters (at their default ×2)
    top_sensitive = _rank_sensitivity(spec, result.spec.organism)

    return SweepResponse(
        t=t_ref,
        parameter=param,
        curves=curves,
        sensitivity_score=round(sensitivity, 4),
        top_sensitive=top_sensitive[:3],
    )


def sensitivity_analysis(spec: IntentSpec, organism: Optional[str] = None) -> dict:
    """Full sensitivity sweep over all parameters → tornado-chart rows.

    For each parameter, perturb ±50% around its default and measure the change in
    peak reporter output. Returns the baseline peak plus per-parameter low/high peaks
    and an impact score (% output change), ranked descending.
    """
    cfg = _resolve(None, organism)
    base_sim = simulate(spec, None)
    base_rep = next((s for s in base_sim.series if s.is_reporter), base_sim.series[0])
    base_peak = _reporter_peak(base_rep.values)

    rows: list[dict] = []
    for pname in _ALL_PARAMS:
        base_val = cfg.get(pname, K if pname == "k" else N if pname == "n" else BETA_P)
        if base_val <= 0:
            continue
        try:
            lo = simulate(spec, SimParams(**{pname: base_val * 0.5}))
            hi = simulate(spec, SimParams(**{pname: base_val * 2.0}))
            lo_peak = _reporter_peak(next((s for s in lo.series if s.is_reporter), lo.series[0]).values)
            hi_peak = _reporter_peak(next((s for s in hi.series if s.is_reporter), hi.series[0]).values)
        except Exception:
            lo_peak = hi_peak = base_peak
        impact = abs(hi_peak - lo_peak) / base_peak * 100 if base_peak > 0 else 0.0
        rows.append({
            "parameter": pname,
            "base_value": round(float(base_val), 4),
            "low_peak": round(lo_peak, 4),
            "high_peak": round(hi_peak, 4),
            "impact_pct": round(impact, 1),
            "critical": impact > 20.0,
        })
    rows.sort(key=lambda r: r["impact_pct"], reverse=True)
    return {"baseline_peak": round(base_peak, 4), "rows": rows}


def _rank_sensitivity(spec: IntentSpec, organism: Optional[str]) -> list[dict]:
    """Rank all parameters by sensitivity score."""
    results = []
    cfg = _resolve(None, organism)
    for pname in _ALL_PARAMS:
        base_val = cfg.get(pname, K if pname == "k" else N if pname == "n" else BETA_P)
        if base_val <= 0:
            continue
        lo_params = SimParams(**{pname: base_val * 0.5})
        hi_params = SimParams(**{pname: base_val * 2.0})
        try:
            sim_lo = simulate(spec, lo_params)
            sim_hi = simulate(spec, hi_params)
            rep_lo = next((s for s in sim_lo.series if s.is_reporter), sim_lo.series[0])
            rep_hi = next((s for s in sim_hi.series if s.is_reporter), sim_hi.series[0])
            peak_lo = _reporter_peak(rep_lo.values)
            peak_hi = _reporter_peak(rep_hi.values)
            if peak_lo > 0:
                score = abs(peak_hi - peak_lo) / peak_lo / 1.5   # 1.5 = (3x range / 2)
            else:
                score = 0.0
        except Exception:
            score = 0.0
        results.append({"parameter": pname, "sensitivity": round(score, 4)})
    results.sort(key=lambda x: x["sensitivity"], reverse=True)
    return results
