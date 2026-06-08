"""Stage 1 of the compiler: normalize user input into a formal IntentSpec.

Supports all 15 circuit patterns via keyword matching.  The deterministic regex path
runs when the LLM is unavailable; the LLM path resolves language → ids and then calls
parse_form.
"""

import re

from modules.parts import library
from shared.schemas.schemas import FormInput, HostOrganism, IntentSpec, Trigger
from modules.compiler.rules import supported_inducers, system_for_inducer, PATTERN_KEYWORDS


class ParseError(ValueError):
    pass


_REPORTER_ALIASES: dict[str, list[str]] = {
    "GFP":        ["gfp", "green", "sfgfp"],
    "RFP":        ["rfp", "red"],
    "YFP":        ["yfp", "yellow"],
    "mCherry":    ["mcherry", "cherry"],
    "mTurquoise2": ["turquoise", "cfp", "cyan"],
    "iRFP713":    ["irfp", "infrared", "near.infrared"],
    "luciferase": ["luciferase", "lux", "bioluminesc"],
    "LacZ":       ["lacz", "blue.white", "beta.galactosidase"],
    "BFP":        ["bfp", "ebfp", "blue fluorescent"],
}

_INDUCER_ALIASES: dict[str, list[str]] = {
    "IPTG":      ["iptg"],
    "aTc":       ["atc", "anhydrotetracycline", "tetracycline"],
    "arabinose": ["arabinose", "ara"],
    "AHL":       ["ahl", "homoserine", "quorum"],
    "rhamnose":  ["rhamnose", "rha"],
    "doxycycline": ["dox", "doxycycline"],
    "galactose":    ["galactose", "gal"],
    "vanillic_acid":["vanillic", "vanillate", "vanillic.acid"],
}

_ABSENCE_PATTERNS = [
    r"\babsence\b",
    r"\bwithout\b",
    r"\bunless\b",
    r"\bno\s+",
    r"\brepressed\s+by\b",
    r"\boff\s+when\b",
]

_HOST_ALIASES: dict[str, list[str]] = {
    "ecoli":     ["ecoli", "e\\.coli", "e coli", "escherichia"],
    "yeast":     ["yeast", "cerevisiae", "saccharomyces", "s\\.cerevisiae"],
    "mammalian": ["mammalian", "hek", "hek293", "cho", "human", "mammal"],
}


def _find_first(text: str, alias_map: dict[str, list[str]]) -> str | None:
    ordered = _find_all(text, alias_map)
    return ordered[0] if ordered else None


def _find_all(text: str, alias_map: dict[str, list[str]]) -> list[str]:
    hits: list[tuple[int, str]] = []
    for canonical, aliases in alias_map.items():
        positions = [
            m.start()
            for alias in aliases
            if (m := re.search(rf"(?i)\b{alias}\b", text))
        ]
        if positions:
            hits.append((min(positions), canonical))
    hits.sort(key=lambda h: h[0])
    return [canonical for _, canonical in hits]


def _detect_gate(text: str) -> str | None:
    if re.search(r"\band\b", text):
        return "and"
    if re.search(r"\bor\b", text):
        return "or"
    return None


def _detect_presence(text: str) -> str:
    for pat in _ABSENCE_PATTERNS:
        if re.search(pat, text):
            return "absent"
    return "present"


def _detect_pattern(text: str) -> str | None:
    """Return a named circuit pattern if a keyword match is found in text."""
    for pattern, keywords in PATTERN_KEYWORDS.items():
        for kw in keywords:
            if re.search(rf"(?i){kw}", text):
                return pattern
    return None


def _detect_host(text: str) -> str | None:
    return _find_first(text, _HOST_ALIASES)


def parse_text(raw: str, organism: str | None = None) -> IntentSpec:
    """Parse free-text biological goal → IntentSpec (15-pattern aware)."""
    text = raw.strip().lower()
    trace: list[str] = [f'parsing free text: "{raw.strip()}"']

    host = organism or _detect_host(text)
    if host:
        trace.append(f"host organism: {host}")

    # --- Special patterns that don't need an inducer ---------------------- #
    named = _detect_pattern(text)

    if named == "constitutive_expression":
        output = _find_first(text, _REPORTER_ALIASES)
        if output is None:
            raise ParseError("Could not identify a reporter for constitutive expression.")
        trace.extend([f"matched reporter '{output}'", "selected pattern: constitutive_expression"])
        return IntentSpec(
            output=output,
            triggers=[],
            pattern="constitutive_expression",
            organism=host,
            trace=trace,
        )

    if named == "oscillator":
        output = _find_first(text, _REPORTER_ALIASES) or "GFP"
        trace.extend([f"reporter for oscillator: {output}", "selected pattern: oscillator"])
        return IntentSpec(
            output=output,
            triggers=[],
            pattern="oscillator",
            organism=host,
            trace=trace,
        )

    if named == "toggle_switch":
        output = _find_first(text, _REPORTER_ALIASES) or "GFP"
        inducers_found = _find_all(text, _INDUCER_ALIASES)
        triggers = [Trigger(inducer=ind, presence="present") for ind in inducers_found[:2]]
        trace.extend([f"reporter: {output}", "selected pattern: toggle_switch"])
        return IntentSpec(
            output=output,
            triggers=triggers,
            pattern="toggle_switch",
            organism=host,
            trace=trace,
        )

    if named in ("negative_feedback", "positive_feedback"):
        output = _find_first(text, _REPORTER_ALIASES)
        if output is None:
            raise ParseError(f"Could not identify a reporter for {named}.")
        inducers_found = _find_all(text, _INDUCER_ALIASES)
        triggers = [Trigger(inducer=ind, presence="present") for ind in inducers_found[:1]]
        trace.extend([f"reporter: {output}", f"selected pattern: {named}"])
        return IntentSpec(
            output=output,
            triggers=triggers,
            pattern=named,
            organism=host,
            trace=trace,
        )

    if named == "feed_forward_loop":
        output = _find_first(text, _REPORTER_ALIASES)
        if output is None:
            raise ParseError("Could not identify a reporter for feed-forward loop.")
        inducers_found = _find_all(text, _INDUCER_ALIASES)
        if not inducers_found:
            raise ParseError("Feed-forward loop requires at least one inducer.")
        triggers = [Trigger(inducer=inducers_found[0], presence="present")]
        trace.extend([f"reporter: {output}", "selected pattern: feed_forward_loop"])
        return IntentSpec(
            output=output,
            triggers=triggers,
            pattern="feed_forward_loop",
            organism=host,
            trace=trace,
        )

    if named == "band_pass_filter":
        output = _find_first(text, _REPORTER_ALIASES)
        if output is None:
            raise ParseError("Could not identify a reporter for band-pass filter.")
        inducers_found = _find_all(text, _INDUCER_ALIASES)
        if not inducers_found:
            raise ParseError("Band-pass filter requires an inducer.")
        triggers = [Trigger(inducer=inducers_found[0], presence="present")]
        trace.extend([f"reporter: {output}", "selected pattern: band_pass_filter"])
        return IntentSpec(
            output=output,
            triggers=triggers,
            pattern="band_pass_filter",
            organism=host,
            trace=trace,
        )

    if named in ("logic_nand", "logic_nor", "combinatorial_logic"):
        output = _find_first(text, _REPORTER_ALIASES) or "GFP"
        inducers_found = _find_all(text, _INDUCER_ALIASES)
        if len(inducers_found) < 2:
            raise ParseError(
                f"{named.replace('_', ' ')} requires at least two inducers. "
                "Supported: " + ", ".join(supported_inducers())
            )
        keep = len(inducers_found) if named == "combinatorial_logic" else 2
        triggers = [Trigger(inducer=ind, presence="present") for ind in inducers_found[:keep]]
        trace.extend([
            f"reporter: {output}",
            f"inputs: {', '.join(t.inducer for t in triggers)}",
            f"selected pattern: {named}",
        ])
        return IntentSpec(
            output=output, triggers=triggers, pattern=named, organism=host, trace=trace,
        )

    # --- Standard inducer-based patterns ---------------------------------- #
    output = _find_first(text, _REPORTER_ALIASES)
    if output is None:
        raise ParseError(
            "Could not identify a reporter. Supported: "
            + ", ".join(_REPORTER_ALIASES.keys())
        )
    trace.append(f"matched reporter '{output}'")

    inducers_found = _find_all(text, _INDUCER_ALIASES)
    if not inducers_found:
        # If no inducer found and no special pattern keyword, try constitutive
        if "constitutive" in text or "always" in text:
            trace.append("no inducer found; defaulting to constitutive_expression")
            return IntentSpec(
                output=output,
                triggers=[],
                pattern="constitutive_expression",
                organism=host,
                trace=trace,
            )
        raise ParseError(
            "Could not identify an inducer. Supported: " + ", ".join(supported_inducers())
        )

    gate = _detect_gate(text)

    # Two-input logic gates
    if len(inducers_found) >= 2 and gate is not None:
        a, b = inducers_found[0], inducers_found[1]
        pattern = "logic_and" if gate == "and" else "logic_or"
        trace.extend([f"matched '{a}' {gate.upper()} '{b}'", f"selected pattern: {pattern}"])
        return IntentSpec(
            output=output,
            triggers=[
                Trigger(inducer=a, presence="present"),
                Trigger(inducer=b, presence="present"),
            ],
            pattern=pattern,
            organism=host,
            trace=trace,
        )

    # Single-input: detect presence/absence and specific named patterns
    inducer = inducers_found[0]
    presence = _detect_presence(text)

    if named == "repressible_expression" or (
        presence == "absent" and named not in ("not_gate",)
    ):
        if named == "repressible_expression":
            trace.extend([f"inducer '{inducer}' represses reporter", "selected pattern: repressible_expression"])
            return IntentSpec(
                output=output,
                triggers=[Trigger(inducer=inducer, presence="absent")],
                pattern="repressible_expression",
                organism=host,
                trace=trace,
            )

    if named == "not_gate" or (presence == "absent"):
        p = "not_gate" if named == "not_gate" else "inducible_expression"
        trace.extend([f"inducer '{inducer}' ({presence})", f"selected pattern: {p}"])
        return IntentSpec(
            output=output,
            triggers=[Trigger(inducer=inducer, presence="absent")],
            pattern=p,
            organism=host,
            trace=trace,
        )

    trace.extend([f"matched inducer '{inducer}' (present)", "selected pattern: inducible_expression"])
    return IntentSpec(
        output=output,
        triggers=[Trigger(inducer=inducer, presence="present")],
        pattern="inducible_expression",
        organism=host,
        trace=trace,
    )


def parse_form(form: FormInput, organism: str | None = None) -> IntentSpec:
    """Map a structured form to an IntentSpec, validating all ids."""
    trace: list[str] = ["parsing structured form input"]

    part = library.get_part(form.output)
    if part is None or part.get("role") != "reporter":
        valid = ", ".join(_REPORTER_ALIASES.keys())
        raise ParseError(f"Unknown reporter '{form.output}'. Valid reporters: {valid}")
    trace.append(f"output reporter '{form.output}'")

    def _check_inducer(inducer_id: str) -> None:
        if library.get_part(inducer_id) is None:
            valid = ", ".join(supported_inducers())
            raise ParseError(f"Unknown inducer '{inducer_id}'. Valid inducers: {valid}")
        if system_for_inducer(inducer_id) is None:
            valid = ", ".join(supported_inducers())
            raise ParseError(f"No inducible system defined for inducer '{inducer_id}'. Valid inducers: {valid}")

    _check_inducer(form.inducer)

    if form.gate is not None and form.inducer2:
        _check_inducer(form.inducer2)
        if form.inducer2 == form.inducer:
            raise ParseError("A logic gate needs two different inducers.")
        pattern = "logic_and" if form.gate == "and" else "logic_or"
        trace.extend([
            f"inducers '{form.inducer}' {form.gate.upper()} '{form.inducer2}' (both present)",
            f"selected pattern: {pattern}",
        ])
        return IntentSpec(
            output=form.output,
            triggers=[
                Trigger(inducer=form.inducer, presence="present"),
                Trigger(inducer=form.inducer2, presence="present"),
            ],
            pattern=pattern,
            organism=organism,
            trace=trace,
        )

    trace.extend([f"inducer '{form.inducer}' ({form.presence})", "selected pattern: inducible_expression"])
    return IntentSpec(
        output=form.output,
        triggers=[Trigger(inducer=form.inducer, presence=form.presence)],
        pattern="inducible_expression",
        organism=organism,
        trace=trace,
    )
