"""LLM-backed natural-language front-end for the parser.

This is the only non-deterministic stage. An LLM (Claude) reads a free-text goal and
emits a *structured* selection over the existing parts library -- the same fields the
deterministic form (`FormInput`) carries. That structured selection is then fed through
the ordinary, fully-deterministic ``parser.parse_form`` so id validation, pattern
selection (inducible / AND / OR) and ``IntentSpec`` construction are identical to the
form path. The LLM only resolves *language* ("make my cells glow green once I add
IPTG") into part ids; it never invents biology or bypasses the rules.

If ``ANTHROPIC_API_KEY`` is unset (or ``LLM_PARSER=off``), callers should fall back to
the deterministic ``parser.parse_text`` -- see ``is_enabled``. This keeps the app
runnable offline and the test-suite hermetic.
"""

import os
from typing import Optional

from pydantic import BaseModel, Field

from models import library
from models.schemas import FormInput, IntentSpec
from compiler import parser
from compiler.parser import ParseError
from compiler.rules import supported_inducers

MODEL = os.environ.get("LLM_PARSER_MODEL", "claude-opus-4-8")


class LLMSelection(BaseModel):
    """Structured output the LLM must return: a selection over known parts.

    ``in_scope`` is False when the request cannot be expressed as an inducible /
    two-input-logic expression circuit over the supported parts.
    """

    in_scope: bool = Field(description="False if the goal is outside supported scope")
    output: Optional[str] = Field(None, description="Reporter id, e.g. 'GFP'")
    inducer: Optional[str] = Field(None, description="Primary inducer id, e.g. 'IPTG'")
    presence: str = Field("present", description="'present' or 'absent'")
    inducer2: Optional[str] = Field(None, description="Second inducer id for a logic gate")
    gate: Optional[str] = Field(None, description="'and' or 'or' for a two-input gate")
    confidence: float = Field(description="0..1 confidence in this interpretation")
    reasoning: str = Field(description="One sentence explaining the interpretation")


def is_enabled() -> bool:
    """True when the LLM parser should be used (key present and not disabled)."""
    if os.environ.get("LLM_PARSER", "").lower() == "off":
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _catalog() -> str:
    """A compact, live description of what the LLM is allowed to choose from."""
    reporters = ", ".join(p["id"] for p in library.reporters())
    inducers = ", ".join(supported_inducers())
    return (
        f"Supported reporters (outputs): {reporters}.\n"
        f"Supported inducers (triggers): {inducers}.\n"
        "Each inducer drives one promoter system: IPTG/pLac, aTc/pTet, arabinose/pBAD."
    )


_SYSTEM = (
    "You translate a synthetic-biology goal written in plain English into a structured "
    "selection of genetic parts. You only choose from the catalog provided; never invent "
    "part ids. Supported circuit shapes:\n"
    "- inducible expression: one reporter driven by one inducer. Set `presence` to "
    "'absent' if the user wants the reporter ON when the inducer is NOT present "
    "(e.g. 'unless', 'without', 'in the absence of').\n"
    "- two-input logic: a reporter gated by two inducers combined with `gate` 'and'/'or'.\n"
    "If the request needs anything else (more than two inputs, repression cascades, "
    "toggle switches, unknown molecules/reporters), set in_scope=false and explain why."
)


def parse_text_llm(raw: str) -> IntentSpec:
    """Interpret free text with the LLM, then compile it deterministically.

    Raises ParseError on out-of-scope input or unknown ids (reusing parse_form's
    validation), so the existing 400-with-message behaviour is preserved.
    """
    import anthropic  # imported lazily so the package is optional when LLM is off

    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=MODEL,
        max_tokens=2000,
        thinking={"type": "adaptive"},
        system=f"{_SYSTEM}\n\nCatalog:\n{_catalog()}",
        messages=[{"role": "user", "content": raw.strip()}],
        output_format=LLMSelection,
    )
    sel = response.parsed_output
    if sel is None:
        raise ParseError("Could not interpret the request. Try rephrasing your goal.")

    if not sel.in_scope or not sel.output or not sel.inducer:
        raise ParseError(
            sel.reasoning
            or "That request is outside the supported inducible/logic circuit scope."
        )

    presence = "absent" if sel.presence == "absent" else "present"
    gate = sel.gate if sel.gate in ("and", "or") else None
    form = FormInput(
        output=sel.output,
        inducer=sel.inducer,
        presence=presence,
        inducer2=sel.inducer2 if gate else None,
        gate=gate,
    )

    # Deterministic compile + id validation. parse_form raises ParseError on bad ids.
    spec = parser.parse_form(form)
    spec.trace = [
        f'natural language: "{raw.strip()}"',
        f"LLM interpretation (confidence {sel.confidence:.2f}): {sel.reasoning}",
        *spec.trace,
    ]
    return spec
