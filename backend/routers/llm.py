"""FastAPI router for LLM utility endpoints.

POST /api/llm/test    — test a provider connection (used by Settings "Test Connection" button)
POST /api/llm/suggest — suggest goal reformulations for ambiguous/failed compiles
"""

from __future__ import annotations

import json
import re
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.schemas import LLMConfig
from compiler.llm_providers import get_provider

router = APIRouter(prefix="/api/llm", tags=["llm"])

_MASKED = "sk-***..."


# --------------------------------------------------------------------------- #
# Test connection
# --------------------------------------------------------------------------- #
class TestRequest(BaseModel):
    llm_config: LLMConfig


class TestResponse(BaseModel):
    ok: bool
    latency_ms: int
    model: str
    error: str | None = None


@router.post("/test", response_model=TestResponse)
async def test_connection(req: TestRequest) -> TestResponse:
    """Send a minimal prompt to verify the provider key and model work."""
    cfg = req.llm_config
    provider = get_provider(cfg)
    t0 = time.monotonic()
    try:
        text, _ = await provider.complete(
            system="You are a helpful assistant.",
            user='Reply with exactly the JSON: {"ok": true}',
            model=cfg.model,
            temperature=0.0,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        # Accept any response that contains "ok" (the model may wrap in prose)
        ok = "ok" in text.lower() or "true" in text.lower()
        return TestResponse(ok=ok, latency_ms=latency_ms, model=cfg.model)
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        return TestResponse(ok=False, latency_ms=latency_ms, model=cfg.model, error=str(exc))


# --------------------------------------------------------------------------- #
# Goal reformulation suggestions
# --------------------------------------------------------------------------- #
class SuggestRequest(BaseModel):
    goal: str
    error: str
    organism: str | None = None
    llm_config: LLMConfig


class SuggestResponse(BaseModel):
    suggestions: list[str]


_SUGGEST_SYSTEM = """\
You are a synthetic biology goal reformulator. A user wrote a goal for a genetic circuit \
compiler and it failed or was ambiguous. Suggest 2-3 clearer reformulations of their goal \
that the compiler is more likely to understand.

Rules:
- Each reformulation should be concrete and name a specific reporter (GFP, RFP, YFP, mCherry, BFP, luciferase)
- Each should name a specific inducer (IPTG, aTc, arabinose, AHL, rhamnose, doxycycline, galactose, vanillic_acid)
- Keep each under 20 words
- Output ONLY a JSON array of strings, e.g. ["suggestion 1", "suggestion 2"]
"""


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_reformulations(req: SuggestRequest) -> SuggestResponse:
    """Return 2-3 goal reformulations for a goal that failed or was marked ambiguous."""
    cfg = req.llm_config
    provider = get_provider(cfg)
    user_msg = f'Goal: "{req.goal}"\nError: {req.error}'
    if req.organism:
        user_msg += f"\nOrganism: {req.organism}"

    try:
        text, _ = await provider.complete(
            system=_SUGGEST_SYSTEM,
            user=user_msg,
            model=cfg.model,
            temperature=0.4,
        )
        # Extract JSON array from response
        text = text.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if fence:
            text = fence.group(1).strip()
        arr_match = re.search(r"\[[\s\S]*\]", text)
        if arr_match:
            suggestions = json.loads(arr_match.group(0))
            if isinstance(suggestions, list):
                return SuggestResponse(suggestions=[str(s) for s in suggestions[:3]])
    except Exception:
        pass
    # Graceful fallback: return some generic suggestions
    return SuggestResponse(suggestions=[
        "Express GFP when IPTG is present",
        "Turn on RFP using arabinose induction",
        "Constitutively express GFP in E. coli",
    ])
