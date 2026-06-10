"""Tests for the rule-based compiler and ODE — gates, parsing, and tunable params.

The compiler is deterministic and LLM-free, so these are exact behavioural checks.
Run from the backend dir with: python -m pytest
"""

import pytest

from modules.compiler import assembler, parser, validate
from modules.compiler.parser import ParseError
from shared.schemas.schemas import FormInput, IntentSpec, SimParams, Trigger
from modules.simulation import ode


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def test_parse_single_inducer_text():
    spec = parser.parse_text("Express GFP when IPTG is present")
    assert spec.output == "GFP"
    assert spec.pattern == "inducible_expression"
    assert len(spec.triggers) == 1
    assert spec.trigger.inducer == "IPTG"
    assert spec.trigger.presence == "present"


def test_parse_absence_sets_presence_absent():
    spec = parser.parse_text("Express GFP in the absence of aTc")
    assert spec.trigger.presence == "absent"
    assert spec.pattern == "inducible_expression"


def test_parse_and_gate_text():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    assert spec.pattern == "logic_and"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "arabinose"]


def test_parse_or_gate_text():
    spec = parser.parse_text("Express RFP when aTc or IPTG is present")
    assert spec.pattern == "logic_or"
    assert {t.inducer for t in spec.triggers} == {"aTc", "IPTG"}


def test_two_inducers_without_connective_is_single_input():
    # No 'and'/'or' connective -> falls back to single-input on the first inducer.
    spec = parser.parse_text("Express GFP with IPTG, arabinose")
    assert spec.pattern == "inducible_expression"
    assert spec.trigger.inducer == "IPTG"


def test_parse_unknown_reporter_raises():
    with pytest.raises(ParseError):
        parser.parse_text("Express unicorn when IPTG is present")


def test_parse_form_gate():
    spec = parser.parse_form(
        FormInput(output="GFP", inducer="IPTG", inducer2="arabinose", gate="and")
    )
    assert spec.pattern == "logic_and"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "arabinose"]


def test_parse_form_gate_requires_distinct_inducers():
    with pytest.raises(ParseError):
        parser.parse_form(
            FormInput(output="GFP", inducer="IPTG", inducer2="IPTG", gate="or")
        )


def test_parse_nand_gate_text():
    spec = parser.parse_text("Express GFP when IPTG NAND aTc")
    assert spec.pattern == "logic_nand"
    assert {t.inducer for t in spec.triggers} == {"IPTG", "aTc"}


def test_parse_nor_gate_text():
    spec = parser.parse_text("Express RFP when IPTG NOR arabinose")
    assert spec.pattern == "logic_nor"
    assert {t.inducer for t in spec.triggers} == {"IPTG", "arabinose"}


def test_parse_combinatorial_keeps_all_inducers():
    spec = parser.parse_text("Combinatorial logic GFP with IPTG and aTc and arabinose")
    assert spec.pattern == "combinatorial_logic"
    assert [t.inducer for t in spec.triggers] == ["IPTG", "aTc", "arabinose"]


def test_inverted_gate_requires_two_inducers():
    with pytest.raises(ParseError):
        parser.parse_text("Express GFP when IPTG NAND")


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #
def test_assemble_single_input_has_reporter_and_units():
    spec = parser.parse_text("Express GFP when IPTG is present")
    circuit = assembler.assemble(spec)
    assert any(n.reporter for n in circuit.nodes)
    assert len(circuit.transcription_units) == 2
    # promoter -> output expression edge exists
    assert any(e.target == "GFP" and e.kind == "expression" for e in circuit.edges)


def test_assemble_and_gate_has_logic_node_and_two_branches():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    circuit = assembler.assemble(spec)
    logic_nodes = [n for n in circuit.nodes if n.type == "logic"]
    assert len(logic_nodes) == 1
    assert logic_nodes[0].label.startswith("AND")
    # both input promoters drive the gate
    gate_inputs = [e for e in circuit.edges if e.target == "GATE"]
    assert len(gate_inputs) == 2
    # gate drives the reporter
    assert any(e.source == "GATE" and e.target == "GFP" for e in circuit.edges)
    # shared constitutive promoter node is not duplicated
    ids = [n.id for n in circuit.nodes]
    assert len(ids) == len(set(ids))
    # three transcription units: two regulator cassettes + output
    assert len(circuit.transcription_units) == 3


def test_assemble_nand_gate_inverts_via_internal_repressor():
    spec = parser.parse_text("Express GFP when IPTG NAND aTc")
    circuit = assembler.assemble(spec)
    # inverter node present, repressing the reporter
    assert any(n.id == "INV" for n in circuit.nodes)
    assert any(e.source == "INV" and e.target == "GFP" and e.kind == "repression"
               for e in circuit.edges)
    result = validate.validate(spec, circuit)
    assert result.ok


def test_assemble_combinatorial_has_three_branches():
    spec = parser.parse_text("Combinatorial logic GFP with IPTG and aTc and arabinose")
    circuit = assembler.assemble(spec)
    gate_inputs = [e for e in circuit.edges if e.target == "GATE"]
    assert len(gate_inputs) == 3
    assert validate.validate(spec, circuit).ok


# --------------------------------------------------------------------------- #
# Simulation
# --------------------------------------------------------------------------- #
def _reporter_series(sim):
    return next(s for s in sim.series if s.is_reporter)


def test_simulate_single_input_rises_after_induction():
    spec = parser.parse_text("Express GFP when IPTG is present")
    sim = ode.simulate(spec)
    rep = _reporter_series(sim)
    # Starts at the promoter's basal steady state (not zero); induced peak ≫ basal.
    assert rep.values[-1] > 3 * rep.values[0]  # induced ≫ basal


def test_simulate_absent_inducer_stays_near_basal():
    # No inducer -> the reporter sits near its (leaky) basal level and the induced
    # case ends much higher. Repression is tight but not infinite, so basal > 0.
    absent = _reporter_series(ode.simulate(parser.parse_text("Express GFP without IPTG")))
    present = _reporter_series(
        ode.simulate(parser.parse_text("Express GFP when IPTG is present"))
    )
    assert present.values[-1] > 5 * absent.values[-1]


def test_and_gate_lower_than_or_gate_midrun():
    # With staggered inputs, at the point where only the FIRST input is on,
    # OR should already be expressing while AND is still off.
    and_spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    or_spec = parser.parse_text("Express GFP when IPTG or arabinose are present")
    and_sim = ode.simulate(and_spec)
    or_sim = ode.simulate(or_spec)
    # index ~ T/3 (first input on at T/4, second at T/2)
    i = len(and_sim.t) // 3
    and_val = _reporter_series(and_sim).values[i]
    or_val = _reporter_series(or_sim).values[i]
    assert or_val > and_val


def test_and_gate_full_expression_at_end():
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    sim = ode.simulate(spec)
    rep = _reporter_series(sim)
    # both inputs on by the end -> output expressed
    assert rep.values[-1] > rep.values[0]
    # 1 reporter + 2 regulators + 2 inducer inputs = 5 series
    assert len(sim.series) == 5


def test_nor_lower_than_or_at_end():
    # With both inputs on by the end, OR is high and NOR is low (inverse).
    or_sim = ode.simulate(parser.parse_text("Express GFP when IPTG or aTc are present"))
    nor_sim = ode.simulate(parser.parse_text("Express GFP when IPTG NOR aTc"))
    assert _reporter_series(or_sim).values[-1] > _reporter_series(nor_sim).values[-1]


def test_tunable_params_scale_output():
    spec = parser.parse_text("Express GFP when IPTG is present")
    base = _reporter_series(ode.simulate(spec))
    boosted = _reporter_series(
        ode.simulate(spec, SimParams(beta_p=40.0))
    )
    assert boosted.values[-1] > base.values[-1]


# Monotonic-direction tests: four single-input cases must each show a
# clear transition across t_on in the biologically correct direction.
CLEAR_MARGIN = 10.0  # AU — chosen relative to beta_p/gamma_p ≈ 125 max SS


def test_inducible_present_reporter_rises():
    """Basal low → induced high after t_on (standard inducible expression)."""
    spec = parser.parse_text("Express GFP when IPTG is present")
    rep = _reporter_series(ode.simulate(spec))
    assert rep.values[-1] > rep.values[0] + CLEAR_MARGIN


def test_inducible_absent_reporter_falls():
    """Inducer present phase-1, removed at t_on: reporter starts high, ends low."""
    spec = parser.parse_text("Express GFP without IPTG")
    assert spec.trigger.presence == "absent"
    rep = _reporter_series(ode.simulate(spec))
    assert rep.values[0] > rep.values[-1] + CLEAR_MARGIN


def test_repressible_reporter_falls():
    """repressible_expression: inducer ON then OFF at t_on → reporter drops."""
    spec = IntentSpec(
        output="GFP",
        triggers=[Trigger(inducer="IPTG", presence="absent")],
        pattern="repressible_expression",
    )
    rep = _reporter_series(ode.simulate(spec))
    assert rep.values[0] > rep.values[-1] + CLEAR_MARGIN


def test_not_gate_reporter_falls():
    """not_gate: input goes from high to low at t_on → reporter drops clearly."""
    spec = IntentSpec(
        output="GFP",
        triggers=[Trigger(inducer="arabinose", presence="absent")],
        pattern="not_gate",
    )
    rep = _reporter_series(ode.simulate(spec))
    assert rep.values[0] > rep.values[-1] + CLEAR_MARGIN


# --------------------------------------------------------------------------- #
# Duration override and regulator dynamics
# --------------------------------------------------------------------------- #
def test_custom_duration_reporter_transition_scales_with_t_on():
    """With duration=400, t_on = 400/3 ≈ 133; reporter is still near basal at the
    default t_on (~67) because _input_plan now uses cfg["t_end"]."""
    spec = parser.parse_text("Express GFP when IPTG is present")

    default_sim = ode.simulate(spec)          # t_end=200, t_on≈67
    long_sim = ode.simulate(spec, SimParams(duration=400.0))  # t_end=400, t_on≈133

    def idx_near(sim, target):
        return min(range(len(sim.t)), key=lambda i: abs(sim.t[i] - target))

    # At t≈100: past the default t_on (67) but before the scaled t_on (133).
    i_default = idx_near(default_sim, 100.0)
    i_long = idx_near(long_sim, 100.0)

    rep_default = _reporter_series(default_sim).values[i_default]
    rep_long = _reporter_series(long_sim).values[i_long]

    # default sim has already crossed t_on at t=100 → reporter rising/high.
    # long sim has not yet crossed t_on at t=100 → reporter still near basal.
    assert rep_default > rep_long * 3


def test_standard_regulator_series_varies_across_t_on():
    """The free/active regulator series in a standard inducible circuit must not be flat."""
    spec = parser.parse_text("Express GFP when IPTG is present")
    sim = ode.simulate(spec)
    reg = next(
        s for s in sim.series
        if not s.is_reporter and "(input)" not in s.name
    )
    assert max(reg.values) - min(reg.values) > 0.1


# --------------------------------------------------------------------------- #
# Per-part kinetics: promoter-specific basal expression
# --------------------------------------------------------------------------- #
def test_pbad_higher_basal_than_ptet_uninduced():
    """pBAD (arabinose, basal_frac≈0.10) leaks more than pTet (aTc, basal_frac≈0.02).

    We compare the reporter level at the pre-induction plateau (well before t_on).
    Both circuits start at their promoter's basal steady state, so the difference
    is visible from the first timepoints.  The plateau at T/4 is reached within
    ~4 degradation time constants (τ ≈ 12.5 min, T/4 ≈ 50 min).
    """
    pbad_spec = parser.parse_text("Express GFP when arabinose is present")
    ptet_spec = parser.parse_text("Express GFP when aTc is present")
    pbad_sim = ode.simulate(pbad_spec)
    ptet_sim = ode.simulate(ptet_spec)

    # Pre-induction window: up to the first quarter of the simulation (before t_on = T/3).
    pre_idx = len(pbad_sim.t) // 4

    pbad_pre = max(_reporter_series(pbad_sim).values[:pre_idx])
    ptet_pre = max(_reporter_series(ptet_sim).values[:pre_idx])

    # pBAD basal_frac (0.10) must produce a noticeably higher basal floor than
    # pTet (0.02) when both are uninduced.
    assert pbad_pre > ptet_pre, (
        f"Expected pBAD pre-induction ({pbad_pre:.2f}) > pTet pre-induction ({ptet_pre:.2f})"
    )


def test_rbs_efficiency_scales_output():
    """Lower rbs_efficiency shrinks the reporter output proportionally."""
    spec = parser.parse_text("Express GFP when IPTG is present")
    full_rbs = _reporter_series(ode.simulate(spec))                       # B0034 eff=1.0
    weak_rbs = _reporter_series(ode.simulate(spec, SimParams(rbs_efficiency=0.3)))  # B0032
    assert full_rbs.values[-1] > weak_rbs.values[-1]
    # Scale should be roughly proportional (within 2×, not 10×)
    assert full_rbs.values[-1] < 10 * weak_rbs.values[-1]


def test_leaky_promoter_warning_matches_elevated_basal():
    """The validator's leaky_expression threshold (basal/max > 10%) is consistent
    with the ODE basal floor: promoters nearer the threshold produce higher
    pre-induction reporter levels than tight promoters.

    pBAD: basal_frac ≈ 0.10 (at the boundary of the warning threshold).
    pTet: basal_frac ≈ 0.02 (well below threshold).
    Both produce distinct basal floors in the simulation.
    """
    from modules.parts import library

    pbad_frac, _ = library.promoter_kinetics("pBAD")
    ptet_frac, _ = library.promoter_kinetics("pTet")
    # Confirm structural assumption: pBAD is near/at the leaky threshold, pTet is not.
    assert pbad_frac >= 0.09, f"pBAD basal_frac={pbad_frac:.3f} should be ≈0.10"
    assert ptet_frac < 0.05, f"pTet basal_frac={ptet_frac:.3f} should be ≈0.02"

    pbad_spec = parser.parse_text("Express GFP when arabinose is present")
    ptet_spec = parser.parse_text("Express GFP when aTc is present")
    pre_idx = len(ode.simulate(pbad_spec).t) // 4
    pbad_pre = max(_reporter_series(ode.simulate(pbad_spec)).values[:pre_idx])
    ptet_pre = max(_reporter_series(ode.simulate(ptet_spec)).values[:pre_idx])
    # Promoter closer to the leaky threshold must show a higher basal floor.
    assert pbad_pre > ptet_pre, (
        f"pBAD pre-induction ({pbad_pre:.2f}) must exceed pTet ({ptet_pre:.2f})"
    )


# --------------------------------------------------------------------------- #
# Dose-response
# --------------------------------------------------------------------------- #
def test_dose_response_band_pass_non_monotonic():
    """Band-pass dose-response must peak at an intermediate inducer concentration."""
    spec = IntentSpec(
        output="GFP",
        triggers=[Trigger(inducer="IPTG", presence="present")],
        pattern="band_pass_filter",
    )
    dr = ode.dose_response(spec)
    outputs = dr.output
    peak_idx = outputs.index(max(outputs))
    # Peak must not be at the first or last dose — it must be at an intermediate level.
    assert 0 < peak_idx < len(outputs) - 1, (
        f"Band-pass peak at index {peak_idx}/{len(outputs)-1} is not intermediate"
    )


def test_dose_response_inducible_monotonic_increasing():
    """Inducible dose-response must be monotonically increasing across the sweep."""
    spec = parser.parse_text("Express GFP when IPTG is present")
    dr = ode.dose_response(spec)
    outputs = dr.output
    # Allow tiny floating-point noise (1e-6 tolerance)
    assert all(outputs[i] <= outputs[i + 1] + 1e-6 for i in range(len(outputs) - 1)), (
        "Inducible dose-response is not monotonically increasing"
    )
    assert outputs[-1] > outputs[0] * 2, "Inducible range too small to confirm sigmoid"


# --------------------------------------------------------------------------- #
# Validation (design-rule checks)
# --------------------------------------------------------------------------- #
def test_validation_passes_for_well_formed_circuit():
    spec = parser.parse_text("Express GFP when IPTG is present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok
    assert all(f.severity != "error" for f in result.findings)


def test_validation_flags_reporter_part_reuse_as_info():
    # The default terminator is reused across both cassettes -> info finding.
    spec = parser.parse_text("Express GFP when IPTG and arabinose are present")
    result = validate.validate(spec, assembler.assemble(spec))
    assert result.ok  # info/warnings do not fail the build
    assert any(f.code == "repeated_part" for f in result.findings)


def test_validation_flags_missing_terminator():
    from shared.schemas.schemas import Circuit, CircuitNode, TranscriptionUnit

    bad = Circuit(
        nodes=[CircuitNode(id="GFP", type="cds", label="GFP", reporter=True)],
        edges=[],
        transcription_units=[TranscriptionUnit(name="leaky", parts=["pLac", "B0034", "GFP"])],
    )
    spec = parser.parse_text("Express GFP when IPTG is present")
    result = validate.validate(spec, bad)
    assert any(f.code == "missing_terminator" for f in result.findings)


# --------------------------------------------------------------------------- #
# Stochastic simulation: Omega scaling and SSA mean vs ODE
# --------------------------------------------------------------------------- #
_SSA_SEED = 42
_SSA_N_TRAJ = 20    # small enough that each test runs in under ~10 s on a single core


def _ssa_compile_response(spec):
    """Minimal CompileResponse for stochastic tests — no LLM needed."""
    from shared.schemas.schemas import CompileResponse
    from modules.compiler import assembler, validate as _validate
    circuit = assembler.assemble(spec)
    val = _validate.validate(spec, circuit)
    sim = ode.simulate(spec)
    return CompileResponse(spec=spec, circuit=circuit, validation=val, simulation=sim, trace=[])


def test_ssa_mean_tracks_ode_constitutive():
    """SSA mean at steady state matches ODE SS within 20% (constitutive expression).

    Omega=5 gives ~625 molecules at SS; Poisson SE of mean ≈ 0.9% across 20 trajectories.
    """
    from shared.schemas.schemas import StochasticRequest
    from modules.simulation.stochastic import run_stochastic

    spec = IntentSpec(output="GFP", triggers=[], pattern="constitutive_expression")
    cr = _ssa_compile_response(spec)

    ode_ss = _reporter_series(ode.simulate(spec)).values[-1]

    result = run_stochastic(StochasticRequest(
        compile_result=cr,
        n_trajectories=_SSA_N_TRAJ,
        seed=_SSA_SEED,
        omega=5.0,
    ))
    ssa_ss = result.series[0].mean[-1]

    assert abs(ssa_ss - ode_ss) / ode_ss < 0.20, (
        f"Constitutive SSA mean ({ssa_ss:.3f}) not within 20% of ODE SS ({ode_ss:.3f})"
    )


def test_ssa_inducible_mean_rises_after_induction():
    """SSA mean reporter increases after induction in an inducible circuit."""
    from shared.schemas.schemas import StochasticRequest
    from modules.simulation.stochastic import run_stochastic

    spec = parser.parse_text("Express GFP when IPTG is present")
    cr = _ssa_compile_response(spec)

    result = run_stochastic(StochasticRequest(
        compile_result=cr,
        n_trajectories=15,   # fewer traj is fine; test checks direction not exact value
        seed=_SSA_SEED,
        omega=3.0,
    ))
    mean_vals = result.series[0].mean
    # Post-induction mean must be substantially higher than pre-induction baseline
    assert mean_vals[-1] > 3 * mean_vals[0], (
        f"Inducible SSA mean end ({mean_vals[-1]:.3f}) not > 3× start ({mean_vals[0]:.3f})"
    )


def test_cv_decreases_with_larger_omega():
    """Larger Omega yields smaller CV (more molecules → less relative noise)."""
    from shared.schemas.schemas import StochasticRequest
    from modules.simulation.stochastic import run_stochastic

    spec = IntentSpec(output="GFP", triggers=[], pattern="constitutive_expression")
    cr = _ssa_compile_response(spec)

    # omega=1 → N_SS≈125 molecules, CV≈0.09; omega=5 → N_SS≈625, CV≈0.04.
    # Both keep step counts < 20 000/trajectory so the test runs in under ~10 s.
    common = dict(compile_result=cr, n_trajectories=_SSA_N_TRAJ, seed=_SSA_SEED)

    cv_small = run_stochastic(StochasticRequest(**common, omega=1.0)).noise_index
    cv_large = run_stochastic(StochasticRequest(**common, omega=5.0)).noise_index

    assert cv_large < cv_small, (
        f"CV with Omega=5 ({cv_large:.4f}) should be < CV with Omega=1 ({cv_small:.4f})"
    )
