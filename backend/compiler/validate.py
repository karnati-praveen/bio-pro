"""Stage 4 of the compiler: design-rule checks (DRC) on the assembled circuit.

Checks span four families:
  structural    — TU grammar, terminators, edge/node integrity
  compatibility — promoter/regulator/inducer consistency, host compatibility
  semantic      — leaky expression, metabolic burden, oscillation risk,
                  orthogonality, cross-reactivity
  biosafety     — part reuse (recombination risk)
"""

from models import library
from models.schemas import (
    Circuit,
    IntentSpec,
    ValidationFinding,
    ValidationResult,
)
from compiler.rules import (
    DEFAULT_TERMINATOR,
    REGULATOR_PROMOTER,
    ORTHOGONALITY_WARNINGS,
    CROSS_REACTIVITY_MATRIX,
    system_for_inducer,
)

_LOGIC_PROMOTER_IDS = {"pAND", "pOR", "pNAND", "pNOR", "pCOMBI", "GATE", "INV"}
_TU_GRAMMAR = ("promoter", "rbs", "cds", "terminator")

# Repressor pairs flagged as cross-reactive, derived from the cross-reactivity matrix.
_CROSS_REACTIVE_PAIRS: list[tuple[str, str]] = [
    (a, b)
    for a, row in CROSS_REACTIVITY_MATRIX.items()
    for b, level in row.items()
    if a < b and level == "weak"
]


def _f(code: str, severity: str, msg: str, target: str | None = None,
       fix: str | None = None) -> ValidationFinding:
    return ValidationFinding(code=code, severity=severity, message=msg,
                             target=target, fix_suggestion=fix)


# --------------------------------------------------------------------------- #
# Structural checks
# --------------------------------------------------------------------------- #
def _check_reporter_present(circuit: Circuit, findings: list) -> None:
    reporters = [n for n in circuit.nodes if n.reporter]
    if not reporters:
        findings.append(_f("no_reporter", "error",
            "Circuit has no reporter; nothing observable would be expressed."))
        return
    if len(reporters) > 1:
        findings.append(_f("multiple_reporters", "error",
            "Expected one reporter, found: " + ", ".join(n.id for n in reporters)))
    for n in reporters:
        part = library.get_part(n.id)
        if part is None or part.get("role") != "reporter":
            findings.append(_f("bad_reporter", "error",
                f"Output '{n.id}' is not a reporter CDS in the library.", n.id))


def _check_promoter_regulators(circuit: Circuit, findings: list) -> None:
    node_ids = {n.id for n in circuit.nodes}
    for node in circuit.nodes:
        if node.type != "promoter":
            continue
        part = library.get_part(node.id) or {}
        regulator = part.get("regulator")
        if regulator and regulator not in node_ids:
            findings.append(_f("orphan_promoter", "error",
                f"Promoter '{node.id}' is regulated by '{regulator}', "
                "which is not expressed in the circuit.", node.id))


def _check_transcription_units(circuit: Circuit, findings: list) -> None:
    for tu in circuit.transcription_units:
        types: list[str] = []
        for pid in tu.parts:
            if pid in _LOGIC_PROMOTER_IDS:
                types.append("promoter")
                findings.append(_f("synthetic_promoter", "info",
                    f"'{pid}' is a designed logic promoter, not a catalogued part.", pid))
                continue
            part = library.get_part(pid)
            if part is None:
                findings.append(_f("unknown_part", "error",
                    f"TU '{tu.name}' references unknown part '{pid}'.", pid))
                types.append("?")
                continue
            types.append(part["type"])
        if tuple(types) != _TU_GRAMMAR:
            findings.append(_f("tu_grammar", "error",
                f"TU '{tu.name}' is not promoter-RBS-CDS-terminator (got {'-'.join(types)}).",
                tu.name))


def _check_graph_integrity(circuit: Circuit, findings: list) -> None:
    node_ids = {n.id for n in circuit.nodes}
    referenced: set[str] = set()
    for edge in circuit.edges:
        for ep in (edge.source, edge.target):
            referenced.add(ep)
            if ep not in node_ids and ep not in _LOGIC_PROMOTER_IDS:
                findings.append(_f("dangling_edge", "error",
                    f"Edge references node '{ep}' not in the circuit.", ep))
    for node in circuit.nodes:
        if node.id not in referenced:
            findings.append(_f("orphan_node", "warning",
                f"Node '{node.id}' ({node.label}) is not connected to anything.", node.id))


# --------------------------------------------------------------------------- #
# Compatibility checks
# --------------------------------------------------------------------------- #
def _check_input_systems(spec: IntentSpec, findings: list) -> None:
    # Patterns without explicit inducers skip this check
    if not spec.triggers:
        return

    constitutive = library.get_part(REGULATOR_PROMOTER)
    if constitutive is None or constitutive.get("role") != "constitutive":
        findings.append(_f("bad_regulator_promoter", "error",
            f"Regulator promoter '{REGULATOR_PROMOTER}' is missing or not constitutive.",
            REGULATOR_PROMOTER))

    for trig in spec.triggers:
        system = system_for_inducer(trig.inducer)
        if system is None:
            findings.append(_f("unsupported_inducer", "error",
                f"No inducible system for inducer '{trig.inducer}'.", trig.inducer))
            continue
        promoter = library.get_part(system["promoter"]) or {}
        for field, expected in (
            ("regulator", system["regulator"]),
            ("inducer", trig.inducer),
            ("induction_mode", system["mode"]),
        ):
            if promoter.get(field) != expected:
                findings.append(_f("rule_part_mismatch", "error",
                    f"Promoter '{system['promoter']}' {field}='{promoter.get(field)}', "
                    f"but rule for '{trig.inducer}' expects '{expected}'.",
                    system["promoter"]))
        if system["mode"] == "activate" and trig.presence == "absent":
            findings.append(_f("induce_off_activator", "warning",
                f"'{trig.inducer}' uses an activation system; 'absent' means reporter is "
                "OFF when inducer is added.", trig.inducer))


def _check_host_compatibility(spec: IntentSpec, circuit: Circuit, findings: list) -> None:
    """Flag parts that do not support the selected host organism."""
    if not spec.organism:
        return
    for node in circuit.nodes:
        part = library.get_part(node.id)
        if part is None:
            continue
        compat = part.get("host_compatibility") or []
        if compat and spec.organism not in compat:
            findings.append(_f("host_incompatible", "error",
                f"Part '{node.id}' ({node.label}) is not characterized for "
                f"'{spec.organism}'. Compatible hosts: {', '.join(compat)}.", node.id,
                fix=f"Swap '{node.id}' for a part validated in {spec.organism}, "
                    f"or change the host to one of: {', '.join(compat)}."))


# --------------------------------------------------------------------------- #
# Structural / biosafety checks
# --------------------------------------------------------------------------- #
def _check_terminators(circuit: Circuit, findings: list) -> None:
    for tu in circuit.transcription_units:
        last = tu.parts[-1] if tu.parts else None
        part = library.get_part(last) if last else None
        if part is None or part.get("type") != "terminator":
            findings.append(_f("missing_terminator", "warning",
                f"TU '{tu.name}' does not end in a terminator; read-through may occur.",
                tu.name,
                fix=f"Append a terminator (e.g. {DEFAULT_TERMINATOR} or L3S2P21) to the "
                    "end of this transcription unit."))


def _check_part_reuse(circuit: Circuit, findings: list) -> None:
    counts: dict[str, int] = {}
    for tu in circuit.transcription_units:
        for pid in tu.parts:
            part = library.get_part(pid) or {}
            if part.get("type") in {"promoter", "terminator"}:
                counts[pid] = counts.get(pid, 0) + 1
    for pid, count in counts.items():
        if count > 1 and pid == DEFAULT_TERMINATOR:
            findings.append(_f("repeated_part", "info",
                f"Part '{pid}' reused in {count} TUs; repeated sequences can recombine in vivo.",
                pid))


# --------------------------------------------------------------------------- #
# Failure warnings (Feature 6)
# --------------------------------------------------------------------------- #
def _check_leaky_expression(circuit: Circuit, findings: list) -> None:
    """Warn if output promoter basal leakiness > 10% of max expression."""
    for node in circuit.nodes:
        if node.type != "promoter" and node.id not in _LOGIC_PROMOTER_IDS:
            continue
        part = library.get_part(node.id)
        if part is None:
            continue
        kp = part.get("kinetic_parameters") or {}
        basal = kp.get("basal_expression", 0.0)
        max_e = kp.get("max_expression", 1.0)
        if max_e > 0 and basal / max_e > 0.10:
            findings.append(_f("leaky_expression", "warning",
                f"Promoter '{node.id}' has high basal leakiness "
                f"({basal/max_e*100:.0f}% of max). "
                "Consider stronger repressor or double-repression architecture.",
                node.id,
                fix=f"Add a second repressor binding site to '{node.id}', or swap in a "
                    "tighter promoter (e.g. pTet has lower basal than pBAD)."))


def _check_metabolic_burden(circuit: Circuit, findings: list) -> None:
    """Warn if more than 3 highly-expressed CDS parts are present."""
    strong_promoters = set()
    for node in circuit.nodes:
        if node.type != "promoter":
            continue
        part = library.get_part(node.id) or {}
        kp = part.get("kinetic_parameters") or {}
        if kp.get("max_expression", 0.0) >= 2.0:
            strong_promoters.add(node.id)

    # Count CDS nodes driven by strong promoters
    cds_nodes = [n for n in circuit.nodes if n.type == "cds" and not n.reporter]
    driven_cds: set[str] = set()
    for edge in circuit.edges:
        if edge.source in strong_promoters and edge.kind == "expression":
            driven_cds.add(edge.target)

    if len(driven_cds) > 3:
        findings.append(_f("metabolic_burden", "warning",
            f"Circuit has {len(driven_cds)} strongly-expressed CDS parts. "
            "This may impose excessive metabolic burden. Consider weaker promoters "
            "or staggered expression.",
            fix="Move one or more CDS onto weaker promoters (e.g. a J23-series part) or "
                "express them sequentially rather than simultaneously."))


def _check_oscillation_risk(spec: IntentSpec, circuit: Circuit, findings: list) -> None:
    """Flag circuits with negative feedback loops that may oscillate."""
    if spec.pattern in ("oscillator",):
        findings.append(_f("oscillation_design", "info",
            "This circuit is designed to oscillate (repressilator topology)."))
        return

    # Detect negative feedback: edge from node back to a node earlier in its own expression path
    node_ids = {n.id for n in circuit.nodes}
    repression_edges = [(e.source, e.target) for e in circuit.edges if e.kind == "repression"]

    # Simple heuristic: reporter represses a promoter upstream of itself
    reporter_nodes = {n.id for n in circuit.nodes if n.reporter}
    for src, tgt in repression_edges:
        if src in reporter_nodes:
            # Find if tgt (promoter) drives src through a short path
            for edge2 in circuit.edges:
                if edge2.source == tgt and edge2.target == src and edge2.kind == "expression":
                    findings.append(_f("oscillation_risk", "warning",
                        f"Negative feedback loop detected ({src} represses its upstream "
                        f"promoter {tgt}). With sufficient time delay, this may oscillate. "
                        "Verify protein half-life and time delay are compatible.",
                        src,
                        fix="Add a buffering gene to reduce loop gain, or use a faster-"
                            "degrading reporter to shorten the feedback delay."))


def _check_orthogonality(circuit: Circuit, findings: list) -> None:
    """Warn about known cross-reactive repressor pairs in the same circuit."""
    repressors_in_circuit = {
        n.id for n in circuit.nodes
        if n.type == "cds" and library.get_part(n.id) and
           library.get_part(n.id).get("role") == "repressor"
    }
    for a, b in _CROSS_REACTIVE_PAIRS:
        if a in repressors_in_circuit and b in repressors_in_circuit:
            findings.append(_f("cross_reactivity", "warning",
                f"Repressors '{a}' and '{b}' may cross-react. "
                "Verify orthogonality experimentally before deployment.",
                f"{a}/{b}",
                fix=f"Replace '{a}' or '{b}' with an orthogonal repressor (e.g. TetR or "
                    "AraC) — see the Parts Library compatibility grid."))


def _check_rbs_strength(circuit: Circuit, findings: list) -> None:
    """Check #7: RBS translation rate >> promoter transcription rate → bottleneck risk.

    Compares the RBS translation efficiency against the promoter's max transcription
    output within each transcription unit; a ratio > 10 flags an oversized RBS.
    """
    for tu in circuit.transcription_units:
        promoter = library.get_part(tu.parts[0]) if tu.parts else None
        rbs = library.get_part(tu.parts[1]) if len(tu.parts) > 1 else None
        if not promoter or not rbs or rbs.get("type") != "rbs":
            continue
        txn = (promoter.get("kinetic_parameters") or {}).get("max_expression", 0.0)
        tln = (rbs.get("kinetic_parameters") or {}).get("translation_efficiency", 0.0)
        if txn > 0 and tln / txn > 10.0:
            findings.append(_f("rbs_strength_mismatch", "warning",
                f"RBS '{rbs['id']}' (translation {tln}) is oversized for promoter "
                f"'{promoter['id']}' (transcription {txn}); a translation bottleneck or "
                "ribosome sequestration may result.",
                rbs["id"],
                fix=f"Pair '{promoter['id']}' with a weaker RBS (e.g. B0032/B0031) or use a "
                    "stronger promoter to balance transcription and translation."))


# --------------------------------------------------------------------------- #
# Main validate function
# --------------------------------------------------------------------------- #
def validate(spec: IntentSpec, circuit: Circuit) -> ValidationResult:
    findings: list[ValidationFinding] = []

    _check_reporter_present(circuit, findings)
    _check_promoter_regulators(circuit, findings)
    _check_transcription_units(circuit, findings)
    _check_graph_integrity(circuit, findings)
    _check_input_systems(spec, findings)
    _check_host_compatibility(spec, circuit, findings)
    _check_terminators(circuit, findings)
    _check_part_reuse(circuit, findings)

    # Feature 6: failure warnings
    _check_leaky_expression(circuit, findings)
    _check_metabolic_burden(circuit, findings)
    _check_oscillation_risk(spec, circuit, findings)
    _check_orthogonality(circuit, findings)
    _check_rbs_strength(circuit, findings)

    ok = not any(f.severity == "error" for f in findings)
    return ValidationResult(ok=ok, findings=findings)
