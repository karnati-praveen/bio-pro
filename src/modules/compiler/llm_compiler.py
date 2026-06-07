"""LLM-powered compiler layer.

Sits above the rule-based compiler. When an LLMConfig is provided:
  1. Builds a system prompt with the live parts catalog injected.
  2. Sends the user's goal to the chosen provider.
  3. Parses the JSON response into an IntentSpec.
  4. Runs the normal assemble → validate → simulate pipeline.
  5. On any failure, falls back to the rule-based compiler if
     fallback is enabled (always enabled from this layer; the caller
     controls whether to pass an LLMConfig at all).

The LLM is ONLY responsible for resolving language → IntentSpec fields.
All biology (assembly, validation, ODE) is deterministic.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import TYPE_CHECKING

from modules.parts import library
from shared.schemas.schemas import IntentSpec, Trigger
from modules.compiler import assembler, parser as rule_parser, validate
from modules.compiler.llm_providers import get_provider
from modules.compiler.parser import ParseError
from modules.compiler.rules import supported_inducers, PATTERN_KEYWORDS
from modules.simulation import ode

if TYPE_CHECKING:
    from shared.schemas.schemas import CompileRequest, CompileResponse, LLMConfig, SimParams

logger = logging.getLogger(__name__)

# ---- Available patterns --------------------------------------------------- #
SUPPORTED_PATTERNS = [
    "inducible_expression", "logic_and", "logic_or", "repressible_expression",
    "constitutive_expression", "not_gate", "toggle_switch", "negative_feedback",
    "positive_feedback", "feed_forward_loop", "band_pass_filter", "oscillator",
    "logic_nand", "logic_nor", "combinatorial_logic",
]

# ---- System prompt -------------------------------------------------------- #
_SYSTEM_TEMPLATE = """\
You are a synthetic biology compiler. Convert a plain-language biological goal \
into a structured JSON specification for a genetic circuit.

PARTS CATALOG (use ONLY these ids — never invent new ones):
{parts_catalog}

SUPPORTED PATTERNS:
{pattern_list}

RULES:
- output: one reporter id from the catalog (e.g. "GFP")
- triggers: list of objects with "inducer" (id from catalog) and "presence" ("present"|"absent")
- pattern: one of the supported patterns above, or "unknown" if the goal cannot be mapped
- organism: "ecoli" | "yeast" | "mammalian" | null
- compiler_trace: 1-3 sentences describing your interpretation
- ambiguous: true only if the goal genuinely cannot be mapped to a supported pattern

Patterns that need triggers:
  inducible_expression  — 1 inducer, present
  repressible_expression — 1 inducer, absent
  not_gate              — 1 inducer, absent
  logic_and/or          — exactly 2 inducers
  logic_nand/nor        — exactly 2 inducers
  negative_feedback/positive_feedback — 1 inducer
  feed_forward_loop     — 1 inducer
  band_pass_filter      — 1 inducer
  toggle_switch         — 0-2 inducers (bistable, no specific inducer required)

Patterns with NO triggers:
  constitutive_expression, oscillator

Output ONLY valid JSON — no markdown fences, no explanation outside the object.

JSON schema:
{{
  "output": "<reporter_id or null>",
  "triggers": [{{"inducer": "<id>", "presence": "present|absent"}}],
  "pattern": "<pattern or 'unknown'>",
  "organism": "<ecoli|yeast|mammalian|null>",
  "compiler_trace": "<interpretation>",
  "ambiguous": false
}}
"""


def _build_catalog() -> str:
    reporters = ", ".join(p["id"] for p in library.reporters())
    inducers = ", ".join(supported_inducers())
    return f"Reporters (outputs): {reporters}.\nInducers (triggers): {inducers}."


def _parse_json(raw: str) -> dict:
    """Extract JSON from the LLM response, stripping markdown fences if present."""
    text = raw.strip()
    # Strip ```json ... ``` fences
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _build_intent_spec(data: dict, organism: str | None) -> IntentSpec:
    """Convert the LLM JSON dict into an IntentSpec, raising ParseError on bad data."""
    pattern = data.get("pattern", "unknown")
    if pattern == "unknown" or data.get("ambiguous"):
        trace_msg = data.get("compiler_trace", "Goal could not be mapped to a supported pattern.")
        raise ParseError(f"ambiguous_goal:{trace_msg}")

    if pattern not in SUPPORTED_PATTERNS:
        raise ParseError(f"LLM returned unsupported pattern '{pattern}'.")

    output = data.get("output")
    if not output:
        raise ParseError("LLM did not specify an output reporter.")

    raw_triggers = data.get("triggers") or []
    triggers = [
        Trigger(
            inducer=str(t.get("inducer", "")).strip(),
            presence="absent" if str(t.get("presence", "present")).lower() == "absent" else "present",
        )
        for t in raw_triggers
        if t.get("inducer")
    ]

    host = organism or data.get("organism") or None

    trace_msg = data.get("compiler_trace", "")
    trace = [f"[LLM] {trace_msg}"] if trace_msg else []

    return IntentSpec(
        output=output,
        triggers=triggers,
        pattern=pattern,
        organism=host,
        trace=trace,
    )


async def compile_with_llm(
    req: "CompileRequest",
    fallback_to_rules: bool = True,
) -> "CompileResponse":
    """Compile a goal using the configured LLM provider.

    Returns a CompileResponse with LLM metadata fields populated.
    Raises ParseError on ambiguous goal (special prefix "ambiguous_goal:").
    Falls back to rule-based compiler on JSON/provider errors when fallback_to_rules=True.
    """
    from shared.schemas.schemas import CompileResponse
    from modules.citations import api as cit_module

    cfg: LLMConfig = req.llm_config  # type: ignore[assignment]
    provider = get_provider(cfg)
    system = _SYSTEM_TEMPLATE.format(
        parts_catalog=_build_catalog(),
        pattern_list="\n".join(f"  - {p}" for p in SUPPORTED_PATTERNS),
    )
    user_goal = req.text or ""
    if req.organism:
        user_goal += f"\nHost organism: {req.organism}"

    t0 = time.monotonic()
    raw_response: str | None = None
    tokens: dict = {}
    compiler_used = "llm"

    try:
        raw_response, tokens = await provider.complete(
            system=system,
            user=user_goal,
            model=cfg.model,
            temperature=cfg.temperature,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)

        data = _parse_json(raw_response)
        spec = _build_intent_spec(data, req.organism)

    except ParseError:
        # ParseError with ambiguous_goal prefix — propagate to caller for dialog
        raise

    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("LLM compile failed (%s): %s", type(exc).__name__, exc)
        if not fallback_to_rules:
            raise ParseError(f"LLM compile error: {exc}") from exc
        # Fallback to rule-based
        compiler_used = "llm_fallback"
        spec = rule_parser.parse_text(req.text or "", organism=req.organism)
        spec.trace.insert(0, f"[LLM fallback] LLM failed ({exc}); using rule-based compiler.")
        circuit = assembler.assemble(spec)
        validation = validate.validate(spec, circuit)
        simulation = ode.simulate(spec, req.params)
        citations_list = cit_module.collect_citations(
            CompileResponse(
                spec=spec, circuit=circuit, validation=validation,
                simulation=simulation, trace=[],
            )
        )
        trace = [*spec.trace, *circuit.trace]
        return CompileResponse(
            spec=spec, circuit=circuit, validation=validation,
            simulation=simulation, trace=trace, citations=citations_list,
            organism=req.organism,
            compiler_used=compiler_used,
            llm_provider=cfg.provider,
            llm_model=cfg.model,
            llm_tokens=tokens or None,
            llm_latency_ms=latency_ms,
            llm_raw_response=raw_response,
        )

    circuit = assembler.assemble(spec)
    validation = validate.validate(spec, circuit)
    simulation = ode.simulate(spec, req.params)
    citations_list = cit_module.collect_citations(
        CompileResponse(
            spec=spec, circuit=circuit, validation=validation,
            simulation=simulation, trace=[],
        )
    )
    trace = [*spec.trace, *circuit.trace]
    return CompileResponse(
        spec=spec, circuit=circuit, validation=validation,
        simulation=simulation, trace=trace, citations=citations_list,
        organism=req.organism,
        compiler_used=compiler_used,
        llm_provider=cfg.provider,
        llm_model=cfg.model,
        llm_tokens=tokens,
        llm_latency_ms=latency_ms,
        llm_raw_response=raw_response,
    )
