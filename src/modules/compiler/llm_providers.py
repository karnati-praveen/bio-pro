"""Provider abstraction for LLM-backed compilation.

Each provider wraps a different SDK/API and exposes one method:
    complete(system, user, model, temperature) -> (response_text, token_usage)

API keys are accepted as constructor arguments and never logged or stored.
Packages are imported lazily so missing optional deps don't break startup.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from shared.schemas.schemas import LLMConfig

logger = logging.getLogger(__name__)

_MASKED = "sk-***..."   # shown in logs instead of real key


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self, system: str, user: str, model: str, temperature: float
    ) -> tuple[str, dict]:
        """Return (response_text, {"input": n, "output": n})."""


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    async def complete(self, system, user, model, temperature):
        try:
            import anthropic
        except ImportError:
            raise RuntimeError("anthropic package not installed — run: pip install anthropic")
        client = anthropic.AsyncAnthropic(api_key=self._key)
        response = await client.messages.create(
            model=model,
            max_tokens=1024,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = response.content[0].text
        return text, {"input": response.usage.input_tokens, "output": response.usage.output_tokens}


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    async def complete(self, system, user, model, temperature):
        try:
            import openai
        except ImportError:
            raise RuntimeError("openai package not installed — run: pip install openai")
        client = openai.AsyncOpenAI(api_key=self._key)
        response = await client.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = response.choices[0].message.content or ""
        return text, {
            "input": response.usage.prompt_tokens,
            "output": response.usage.completion_tokens,
        }


class GoogleProvider(LLMProvider):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    async def complete(self, system, user, model, temperature):
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError(
                "google-generativeai package not installed — run: pip install google-generativeai"
            )
        genai.configure(api_key=self._key)
        gemini = genai.GenerativeModel(
            model_name=model,
            system_instruction=system,
        )
        cfg = genai.GenerationConfig(temperature=temperature)
        response = await gemini.generate_content_async(user, generation_config=cfg)
        text = response.text
        usage = getattr(response, "usage_metadata", None)
        return text, {
            "input": getattr(usage, "prompt_token_count", 0),
            "output": getattr(usage, "candidates_token_count", 0),
        }


class MistralProvider(LLMProvider):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    async def complete(self, system, user, model, temperature):
        try:
            from mistralai import Mistral
        except ImportError:
            raise RuntimeError(
                "mistralai package not installed — run: pip install mistralai"
            )
        client = Mistral(api_key=self._key)
        response = await client.chat.complete_async(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = response.choices[0].message.content or ""
        return text, {
            "input": response.usage.prompt_tokens,
            "output": response.usage.completion_tokens,
        }


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434") -> None:
        self._base = base_url.rstrip("/")

    async def complete(self, system, user, model, temperature):
        import httpx

        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(
                f"{self._base}/api/generate",
                json={
                    "model": model,
                    "system": system,
                    "prompt": user,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": temperature},
                },
            )
            res.raise_for_status()
            data = res.json()
        text = data.get("response", "")
        return text, {
            "input": data.get("prompt_eval_count", 0),
            "output": data.get("eval_count", 0),
        }


def get_provider(config: "LLMConfig") -> LLMProvider:
    """Instantiate the right provider from an LLMConfig."""
    p = config.provider
    if p == "anthropic":
        if not config.api_key:
            raise ValueError("Anthropic API key is required.")
        return AnthropicProvider(config.api_key)
    if p == "openai":
        if not config.api_key:
            raise ValueError("OpenAI API key is required.")
        return OpenAIProvider(config.api_key)
    if p == "google":
        if not config.api_key:
            raise ValueError("Google API key is required.")
        return GoogleProvider(config.api_key)
    if p == "mistral":
        if not config.api_key:
            raise ValueError("Mistral API key is required.")
        return MistralProvider(config.api_key)
    if p == "ollama":
        return OllamaProvider(config.ollama_url or "http://localhost:11434")
    raise ValueError(f"Unknown provider: {p!r}")
