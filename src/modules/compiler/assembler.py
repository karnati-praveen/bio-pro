"""Stage 3 of the compiler: turn an IntentSpec into a concrete genetic Circuit.

Supports all 15 circuit patterns.  Each topology has its own _build_* function
that returns nodes, edges, and transcription units.
"""

from modules.parts import library
from shared.schemas.schemas import (
    Circuit,
    CircuitEdge,
    CircuitNode,
    IntentSpec,
    TranscriptionUnit,
)
from modules.compiler.rules import (
    DEFAULT_RBS,
    DEFAULT_TERMINATOR,
    REGULATOR_PROMOTER,
    REPRESSILATOR,
    TOGGLE_SWITCH,
    system_for_inducer,
)

_GATE_LABEL = {
    "logic_and": "AND",
    "logic_or": "OR",
    "logic_nand": "NAND",
    "logic_nor": "NOR",
    "combinatorial_logic": "COMBI",
}
_INVERTING_GATES = {"logic_nand", "logic_nor"}


class AssemblyError(ValueError):
    pass


# --------------------------------------------------------------------------- #
# Node helpers
# --------------------------------------------------------------------------- #
def _node(part_id: str, *, reporter: bool = False) -> CircuitNode:
    part = library.get_part(part_id)
    if part is None:
        raise AssemblyError(f"Part '{part_id}' not in library.")
    return CircuitNode(
        id=part["id"],
        type=part["type"],
        label=part["name"],
        role=part.get("role"),
        reporter=reporter,
        color=part.get("color"),
    )


def _synthetic_node(nid: str, label: str, ntype: str, color: str = "#6c757d") -> CircuitNode:
    return CircuitNode(id=nid, type=ntype, label=label, role="logic", color=color)


def _dedupe_nodes(nodes: list[CircuitNode]) -> list[CircuitNode]:
    seen: set[str] = set()
    result: list[CircuitNode] = []
    for n in nodes:
        if n.id not in seen:
            seen.add(n.id)
            result.append(n)
    return result


# --------------------------------------------------------------------------- #
# Single inducible input branch
# --------------------------------------------------------------------------- #
def _input_branch(inducer: str) -> dict:
    system = system_for_inducer(inducer)
    if system is None:
        raise AssemblyError(f"No inducible system for '{inducer}'.")

    promoter, regulator, mode = system["promoter"], system["regulator"], system["mode"]

    nodes = [_node(REGULATOR_PROMOTER), _node(regulator), _node(inducer), _node(promoter)]
    reg_kind = "repression" if mode == "derepress" else "activation"
    ind_kind = "inhibition" if mode == "derepress" else "activation"

    edges = [
        CircuitEdge(source=REGULATOR_PROMOTER, target=regulator, kind="expression"),
        CircuitEdge(source=regulator, target=promoter, kind=reg_kind),
        CircuitEdge(source=inducer, target=regulator, kind=ind_kind),
    ]
    tu = TranscriptionUnit(
        name=f"{regulator} cassette",
        parts=[REGULATOR_PROMOTER, DEFAULT_RBS, regulator, DEFAULT_TERMINATOR],
    )
    if mode == "derepress":
        trace = f"{inducer}: {regulator} represses {promoter}; {inducer} relieves repression"
    else:
        trace = f"{inducer}: {inducer}-bound {regulator} activates {promoter}"

    return {"promoter": promoter, "regulator": regulator, "mode": mode,
            "nodes": nodes, "edges": edges, "tu": tu, "trace": trace}


# --------------------------------------------------------------------------- #
# Pattern builders
# --------------------------------------------------------------------------- #
def _build_inducible(spec: IntentSpec, output: str) -> Circuit:
    branch = _input_branch(spec.trigger.inducer)
    nodes = [*branch["nodes"], _node(output, reporter=True)]
    edges = [*branch["edges"],
             CircuitEdge(source=branch["promoter"], target=output, kind="expression")]
    output_tu = TranscriptionUnit(
        name=f"{output} cassette",
        parts=[branch["promoter"], DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    )
    trace = [
        f"output reporter: {output}",
        branch["trace"],
        f"{branch['promoter']} drives {output} expression",
    ]
    return Circuit(nodes=_dedupe_nodes(nodes), edges=edges,
                   transcription_units=[branch["tu"], output_tu], trace=trace)


def _build_repressible(spec: IntentSpec, output: str) -> Circuit:
    """Inducer present → reporter OFF. Same topology as inducible_expression (presence=absent)."""
    return _build_inducible(spec, output)


def _build_not_gate(spec: IntentSpec, output: str) -> Circuit:
    """NOT gate: reporter expressed in absence of inducer."""
    return _build_inducible(spec, output)


def _build_constitutive(spec: IntentSpec, output: str) -> Circuit:
    """No regulation: pCon → RBS → reporter → terminator."""
    nodes = [_node(REGULATOR_PROMOTER), _node(output, reporter=True)]
    edges = [CircuitEdge(source=REGULATOR_PROMOTER, target=output, kind="expression")]
    tu = TranscriptionUnit(
        name=f"{output} cassette",
        parts=[REGULATOR_PROMOTER, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    )
    return Circuit(nodes=_dedupe_nodes(nodes), edges=edges,
                   transcription_units=[tu],
                   trace=[f"constitutive expression: {REGULATOR_PROMOTER} → {output}"])


def _build_two_input_gate(spec: IntentSpec, output: str) -> Circuit:
    """Multi-input logic gate. Handles AND/OR (direct), NAND/NOR (inverted output via
    an internal repressor that gates a constitutive reporter promoter), and N-input
    combinatorial (AND of all inputs)."""
    gate_label = _GATE_LABEL[spec.pattern]
    inverting = spec.pattern in _INVERTING_GATES
    branches = [_input_branch(t.inducer) for t in spec.triggers]

    gate_node = _synthetic_node("GATE", f"{gate_label} gate", "logic")
    output_node = _node(output, reporter=True)

    nodes = [n for b in branches for n in b["nodes"]] + [gate_node, output_node]
    edges = [e for b in branches for e in b["edges"]]
    for b in branches:
        edges.append(CircuitEdge(source=b["promoter"], target="GATE", kind="expression"))

    inputs_active = {
        "logic_and": "ALL", "combinatorial_logic": "ALL",
        "logic_or": "ANY", "logic_nand": "NOT ALL", "logic_nor": "NO",
    }[spec.pattern]

    if inverting:
        # Inverted output: GATE drives an internal repressor that represses a
        # constitutive reporter promoter, so the reporter is ON unless the gate fires.
        inv_node = _synthetic_node("INV", f"{gate_label} inverter", "logic", color="#e63946")
        nodes += [_node(REGULATOR_PROMOTER), inv_node]
        edges += [
            CircuitEdge(source="GATE", target="INV", kind="expression"),
            CircuitEdge(source=REGULATOR_PROMOTER, target=output, kind="expression"),
            CircuitEdge(source="INV", target=output, kind="repression"),
        ]
        output_tu = TranscriptionUnit(
            name=f"{output} cassette ({gate_label} output)",
            parts=[REGULATOR_PROMOTER, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )
    else:
        edges.append(CircuitEdge(source="GATE", target=output, kind="expression"))
        output_tu = TranscriptionUnit(
            name=f"{output} cassette ({gate_label} output)",
            parts=[f"p{gate_label}", DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )

    trace = [
        f"output reporter: {output}",
        f"{gate_label} gate of: {', '.join(t.inducer for t in spec.triggers)}",
        *[b["trace"] for b in branches],
        f"{output} expressed when {inputs_active} inputs active",
    ]
    return Circuit(nodes=_dedupe_nodes(nodes), edges=edges,
                   transcription_units=[*[b["tu"] for b in branches], output_tu], trace=trace)


def _build_toggle_switch(spec: IntentSpec, output: str) -> Circuit:
    """Bistable toggle switch: cI/cI434 mutual repression (Gardner et al. 2000)."""
    arm1, arm2 = TOGGLE_SWITCH["arm1"], TOGGLE_SWITCH["arm2"]

    nodes = [
        _node(REGULATOR_PROMOTER),
        _node(arm1["promoter"]),
        _node(arm1["repressor"]),
        _node(arm2["promoter"]),
        _node(arm2["repressor"]),
        _node(output, reporter=True),
    ]
    edges = [
        CircuitEdge(source=REGULATOR_PROMOTER, target=arm1["repressor"], kind="expression"),
        CircuitEdge(source=REGULATOR_PROMOTER, target=arm2["repressor"], kind="expression"),
        CircuitEdge(source=arm1["repressor"], target=arm2["promoter"], kind="repression"),
        CircuitEdge(source=arm2["repressor"], target=arm1["promoter"], kind="repression"),
        CircuitEdge(source=arm1["promoter"], target=output, kind="expression"),
    ]
    tu1 = TranscriptionUnit(
        name="arm1 (cI cassette)",
        parts=[arm2["promoter"], DEFAULT_RBS, arm1["repressor"], DEFAULT_TERMINATOR],
    )
    tu2 = TranscriptionUnit(
        name="arm2 (cI434 cassette)",
        parts=[arm1["promoter"], DEFAULT_RBS, arm2["repressor"], DEFAULT_TERMINATOR],
    )
    output_tu = TranscriptionUnit(
        name=f"{output} cassette",
        parts=[arm1["promoter"], DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    )
    trace = [
        "toggle switch: cI ⊣ pCI434 and cI434 ⊣ pCI",
        f"reporter {output} driven from {arm1['promoter']} (arm 1)",
        "bistable — initial state determines which repressor dominates",
    ]
    return Circuit(nodes=_dedupe_nodes(nodes), edges=edges,
                   transcription_units=[tu1, tu2, output_tu], trace=trace)


def _build_negative_feedback(spec: IntentSpec, output: str) -> Circuit:
    """Output protein represses its own promoter."""
    if spec.triggers:
        branch = _input_branch(spec.trigger.inducer)
        promoter_id = branch["promoter"]
        all_nodes = [*branch["nodes"], _node(output, reporter=True)]
        all_edges = [
            *branch["edges"],
            CircuitEdge(source=promoter_id, target=output, kind="expression"),
            CircuitEdge(source=output, target=promoter_id, kind="repression"),
        ]
        output_tu = TranscriptionUnit(
            name=f"{output} cassette (neg. feedback)",
            parts=[promoter_id, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )
        tus = [branch["tu"], output_tu]
        trace = [
            f"inducible negative feedback: {spec.trigger.inducer} induces {output}",
            f"{output} also represses {promoter_id} (negative feedback loop)",
        ]
    else:
        all_nodes = [_node(REGULATOR_PROMOTER), _node(output, reporter=True)]
        all_edges = [
            CircuitEdge(source=REGULATOR_PROMOTER, target=output, kind="expression"),
            CircuitEdge(source=output, target=REGULATOR_PROMOTER, kind="repression"),
        ]
        tus = [TranscriptionUnit(
            name=f"{output} cassette (neg. feedback)",
            parts=[REGULATOR_PROMOTER, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )]
        trace = [f"negative autoregulation: {output} represses its own constitutive promoter"]

    return Circuit(nodes=_dedupe_nodes(all_nodes), edges=all_edges,
                   transcription_units=tus, trace=trace)


def _build_positive_feedback(spec: IntentSpec, output: str) -> Circuit:
    """Output protein activates its own promoter."""
    if spec.triggers:
        branch = _input_branch(spec.trigger.inducer)
        promoter_id = branch["promoter"]
        all_nodes = [*branch["nodes"], _node(output, reporter=True)]
        all_edges = [
            *branch["edges"],
            CircuitEdge(source=promoter_id, target=output, kind="expression"),
            CircuitEdge(source=output, target=promoter_id, kind="activation"),
        ]
        output_tu = TranscriptionUnit(
            name=f"{output} cassette (pos. feedback)",
            parts=[promoter_id, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )
        tus = [branch["tu"], output_tu]
        trace = [
            f"inducible positive feedback: {spec.trigger.inducer} initiates {output}",
            f"{output} activates {promoter_id} (positive feedback loop — bistable/switch-like)",
        ]
    else:
        all_nodes = [_node(REGULATOR_PROMOTER), _node(output, reporter=True)]
        all_edges = [
            CircuitEdge(source=REGULATOR_PROMOTER, target=output, kind="expression"),
            CircuitEdge(source=output, target=REGULATOR_PROMOTER, kind="activation"),
        ]
        tus = [TranscriptionUnit(
            name=f"{output} cassette (pos. feedback)",
            parts=[REGULATOR_PROMOTER, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
        )]
        trace = [f"positive autoregulation: {output} activates its own constitutive promoter"]

    return Circuit(nodes=_dedupe_nodes(all_nodes), edges=all_edges,
                   transcription_units=tus, trace=trace)


def _build_feed_forward_loop(spec: IntentSpec, output: str) -> Circuit:
    """Coherent feed-forward: inducer activates regulator AND output; regulator also controls output."""
    branch = _input_branch(spec.trigger.inducer)
    promoter_id = branch["promoter"]
    regulator_id = branch["regulator"]

    # Direct path: inducer → output (via same promoter as regulator)
    all_nodes = [*branch["nodes"], _node(output, reporter=True)]
    all_edges = [
        *branch["edges"],
        CircuitEdge(source=promoter_id, target=output, kind="expression"),
        # Regulator also controls output (second path: activation for coherent FFL)
        CircuitEdge(source=regulator_id, target=output, kind="activation"),
    ]
    output_tu = TranscriptionUnit(
        name=f"{output} cassette (FFL output)",
        parts=[promoter_id, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    )
    trace = [
        f"feed-forward loop (FFL): {spec.trigger.inducer} activates both {regulator_id} and {output}",
        f"{regulator_id} also regulates {output} (second path creates sign-sensitive delay)",
        "coherent type-1 FFL: delays ON response, filters transient inputs",
    ]
    return Circuit(nodes=_dedupe_nodes(all_nodes), edges=all_edges,
                   transcription_units=[branch["tu"], output_tu], trace=trace)


def _build_band_pass_filter(spec: IntentSpec, output: str) -> Circuit:
    """Band-pass: low and high repressor arms, output only in concentration window."""
    branch = _input_branch(spec.trigger.inducer)
    promoter_id = branch["promoter"]
    regulator_id = branch["regulator"]

    # High-dose arm: a second activator that produces a repressor at high concentrations
    high_repressor_id = "TetR" if regulator_id != "TetR" else "LacI"
    high_promoter_id = "pTet" if high_repressor_id == "TetR" else "pLac"

    high_rep_node = library.get_part(high_repressor_id)
    high_prom_node = library.get_part(high_promoter_id)

    if not high_rep_node or not high_prom_node:
        # Fallback to simple inducible if parts unavailable
        return _build_inducible(spec, output)

    all_nodes = [
        *branch["nodes"],
        _node(high_repressor_id),
        _node(high_promoter_id),
        _node(output, reporter=True),
    ]
    all_edges = [
        *branch["edges"],
        CircuitEdge(source=promoter_id, target=output, kind="expression"),
        CircuitEdge(source=promoter_id, target=high_repressor_id, kind="expression"),
        CircuitEdge(source=high_repressor_id, target=high_promoter_id, kind="repression"),
        CircuitEdge(source=high_promoter_id, target=output, kind="repression"),
    ]
    output_tu = TranscriptionUnit(
        name=f"{output} cassette (band-pass)",
        parts=[promoter_id, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    )
    high_tu = TranscriptionUnit(
        name=f"{high_repressor_id} cassette (high-dose repressor)",
        parts=[promoter_id, DEFAULT_RBS, high_repressor_id, DEFAULT_TERMINATOR],
    )
    trace = [
        f"band-pass filter: {output} expressed only within {spec.trigger.inducer} window",
        f"low-dose arm: {spec.trigger.inducer} → {regulator_id} → {promoter_id} → {output}",
        f"high-dose arm: {promoter_id} also → {high_repressor_id} → represses {output}",
        "output peaks at intermediate inducer concentration",
    ]
    return Circuit(nodes=_dedupe_nodes(all_nodes), edges=all_edges,
                   transcription_units=[branch["tu"], high_tu, output_tu], trace=trace)


def _build_oscillator(spec: IntentSpec, output: str) -> Circuit:
    """Repressilator: 3-gene ring LacI→TetR→cI→LacI + reporter on last promoter."""
    nodes = [_node(REGULATOR_PROMOTER)]
    edges: list[CircuitEdge] = []
    tus: list[TranscriptionUnit] = []

    # Build the 3-gene ring
    for arm in REPRESSILATOR:
        rep_node = library.get_part(arm["repressor"])
        prom_node = library.get_part(arm["expressed_from"])
        repressed_prom = library.get_part(arm["represses"])
        if not rep_node or not prom_node or not repressed_prom:
            raise AssemblyError(
                f"Repressilator part missing: {arm['repressor']}/{arm['expressed_from']}/{arm['represses']}"
            )
        nodes.extend([_node(arm["repressor"]), _node(arm["expressed_from"])])
        edges.append(CircuitEdge(
            source=arm["expressed_from"], target=arm["repressor"], kind="expression"
        ))
        edges.append(CircuitEdge(
            source=arm["repressor"], target=arm["represses"], kind="repression"
        ))
        tus.append(TranscriptionUnit(
            name=f"{arm['repressor']} cassette (repressilator)",
            parts=[arm["expressed_from"], DEFAULT_RBS, arm["repressor"], DEFAULT_TERMINATOR],
        ))

    # Reporter driven from pLac (the node repressed by cI in the ring)
    reporter_promoter = REPRESSILATOR[2]["represses"]  # pLac
    nodes.append(_node(output, reporter=True))
    edges.append(CircuitEdge(source=reporter_promoter, target=output, kind="expression"))
    tus.append(TranscriptionUnit(
        name=f"{output} cassette (repressilator reporter)",
        parts=[reporter_promoter, DEFAULT_RBS, output, DEFAULT_TERMINATOR],
    ))

    trace = [
        "repressilator: LacI ⊣ pTet, TetR ⊣ pCI, cI ⊣ pLac (ring repression)",
        f"reporter {output} driven from pLac (oscillates with the ring)",
        "generates sustained oscillations with ~period dependent on protein half-lives",
    ]
    return Circuit(nodes=_dedupe_nodes(nodes), edges=edges, transcription_units=tus, trace=trace)


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #
def assemble(spec: IntentSpec) -> Circuit:
    """Dispatch to the appropriate circuit builder based on the parsed pattern."""
    output = spec.output
    p = spec.pattern

    if p in ("inducible_expression", "not_gate"):
        return _build_inducible(spec, output)
    if p == "repressible_expression":
        return _build_repressible(spec, output)
    if p == "constitutive_expression":
        return _build_constitutive(spec, output)
    if p in ("logic_and", "logic_or", "logic_nand", "logic_nor", "combinatorial_logic"):
        return _build_two_input_gate(spec, output)
    if p == "toggle_switch":
        return _build_toggle_switch(spec, output)
    if p == "negative_feedback":
        return _build_negative_feedback(spec, output)
    if p == "positive_feedback":
        return _build_positive_feedback(spec, output)
    if p == "feed_forward_loop":
        return _build_feed_forward_loop(spec, output)
    if p == "band_pass_filter":
        return _build_band_pass_filter(spec, output)
    if p == "oscillator":
        return _build_oscillator(spec, output)

    raise AssemblyError(f"Unknown circuit pattern: '{p}'")
