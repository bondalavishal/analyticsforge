import logging
from typing import List

import httpx

from app.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class GroqProvider(BaseLLMProvider):
    name = "groq"
    BASE_URL = "https://api.groq.com/openai/v1"
    MODEL_FALLBACK_ORDER = [
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3-32b",
        "llama-3.1-8b-instant",
        "allam-2-7b",
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
            raise ValueError("Groq API key not set")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        last_http_error: httpx.HTTPStatusError | None = None
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=60) as client:
            for model_name in self.MODEL_FALLBACK_ORDER:
                logger.info("Groq model attempt: %s", model_name)
                try:
                    response = await client.post(
                        f"{self.BASE_URL}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
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
                    last_error = ValueError(f"Groq model {model_name} returned empty content")
                    continue
                except httpx.HTTPStatusError as e:
                    last_http_error = e
                    last_error = e
                    status = e.response.status_code
                    logger.warning(
                        "Groq model %s failed with HTTP %s, trying next model",
                        model_name,
                        status,
                    )
                    continue
                except Exception as e:
                    last_error = e
                    logger.warning("Groq model %s failed: %s", model_name, e)
                    continue

        if last_http_error is not None:
            raise last_http_error
        if last_error is not None:
            raise RuntimeError(f"Groq model fallback exhausted. Last error: {last_error}")
        raise RuntimeError("Groq model fallback exhausted with no response")

    async def is_available(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.BASE_URL}/models", headers={"Authorization": f"Bearer {self.api_key}"})
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.BASE_URL}/models", headers={"Authorization": f"Bearer {self.api_key}"})
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
        except Exception:
            return list(self.MODEL_FALLBACK_ORDER)
