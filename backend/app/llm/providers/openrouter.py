import logging
from typing import List

import httpx

from app.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(BaseLLMProvider):
    name = "openrouter"
    BASE_URL = "https://openrouter.ai/api/v1"
    MODEL_FALLBACK_ORDER = [
        "openrouter/elephant-alpha",
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-31b-it:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "qwen/qwen3-next-80b-a3b-instruct:free",
        "qwen/qwen3-coder:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "minimax/minimax-m2.5:free",
        "openai/gpt-oss-120b:free",
        "openai/gpt-oss-20b:free",
        "z-ai/glm-4.5-air:free",
        "arcee-ai/trinity-large-preview:free",
        "nousresearch/hermes-3-llama-3.1-405b:free",
        "nvidia/nemotron-nano-12b-v2-vl:free",
        "nvidia/nemotron-nano-9b-v2:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemma-3-27b-it:free",
        "google/gemma-3-12b-it:free",
        "google/gemma-3-4b-it:free",
        "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
        "liquid/lfm-2.5-1.2b-thinking:free",
        "liquid/lfm-2.5-1.2b-instruct:free",
        "google/gemma-3n-e4b-it:free",
        "google/gemma-3n-e2b-it:free",
    ]
    DEFAULT_MODEL = MODEL_FALLBACK_ORDER[0]

    def __init__(self, api_key: str):
        self.api_key = api_key

    @staticmethod
    def _extract_content_text(content) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            chunks: List[str] = []
            for part in content:
                if isinstance(part, str):
                    chunks.append(part)
                elif isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str):
                        chunks.append(text)
            return "".join(chunks).strip()
        return ""

    async def generate(self, prompt: str, system_prompt: str = "", max_tokens: int = 4096) -> str:
        if not self.api_key:
            raise ValueError("OpenRouter API key not set")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        last_http_error: httpx.HTTPStatusError | None = None
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=60) as client:
            for model_name in self.MODEL_FALLBACK_ORDER:
                logger.info("OpenRouter model attempt: %s", model_name)
                try:
                    response = await client.post(
                        f"{self.BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://analyticsforge.app",
                            "X-Title": "AnalyticsForge",
                        },
                        json={"model": model_name, "messages": messages, "max_tokens": max_tokens},
                    )
                    response.raise_for_status()
                    data = response.json()
                    choices = data.get("choices") or []
                    if choices:
                        message = choices[0].get("message") or {}
                        content = message.get("content")
                        text = self._extract_content_text(content)
                        if text:
                            return text
                    last_error = ValueError(f"OpenRouter model {model_name} returned empty content")
                    continue
                except httpx.HTTPStatusError as e:
                    last_http_error = e
                    last_error = e
                    status = e.response.status_code
                    logger.warning(
                        "OpenRouter model %s failed with HTTP %s, trying next model",
                        model_name,
                        status,
                    )
                    continue
                except Exception as e:
                    last_error = e
                    logger.warning("OpenRouter model %s failed: %s", model_name, e)
                    continue

        if last_http_error is not None:
            raise last_http_error
        if last_error is not None:
            raise RuntimeError(f"OpenRouter model fallback exhausted. Last error: {last_error}")
        raise RuntimeError("OpenRouter model fallback exhausted with no response")

    async def is_available(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
        except Exception:
            return list(self.MODEL_FALLBACK_ORDER)
