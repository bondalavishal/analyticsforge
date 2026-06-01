import logging
import re
from typing import List

import httpx

from app.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class GoogleProvider(BaseLLMProvider):
    name = "google"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
    MODEL_FALLBACK_ORDER = [
        # Tier 1 (highest free-tier daily quota)
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        # Tier 2
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-3-flash-preview",
        "gemini-2.5-flash-lite",
    ]
    DEFAULT_MODEL = MODEL_FALLBACK_ORDER[0]

    def __init__(self, api_key: str):
        self.api_keys = self._normalize_api_keys(api_key)
        self.api_key = self.api_keys[0] if self.api_keys else ""

    @staticmethod
    def _normalize_api_keys(api_keys_raw: str) -> List[str]:
        # Accept comma/newline/semicolon/whitespace-separated keys and preserve order.
        parts = [p.strip() for p in re.split(r"[\s,;]+", api_keys_raw or "") if p.strip()]
        deduped: List[str] = []
        seen = set()
        for key in parts:
            if key in seen:
                continue
            seen.add(key)
            deduped.append(key)
        return deduped

    async def generate(self, prompt: str, system_prompt: str = "", max_tokens: int = 4096) -> str:
        if not self.api_keys:
            raise ValueError("Google AI API key not set")

        payload: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        tried_models: List[str] = []
        last_http_error: httpx.HTTPStatusError | None = None
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=60) as client:
            for model_name in self.MODEL_FALLBACK_ORDER:
                tried_models.append(model_name)
                logger.info("Google model attempt: %s", model_name)
                model_missing = False
                for key_index, api_key in enumerate(self.api_keys):
                    try:
                        response = await client.post(
                            f"{self.BASE_URL}/models/{model_name}:generateContent",
                            params={"key": api_key},
                            json=payload,
                        )
                        response.raise_for_status()
                        data = response.json()
                        candidates = data.get("candidates") or []
                        for candidate in candidates:
                            content = candidate.get("content") or {}
                            parts = content.get("parts") or []
                            for part in parts:
                                text = part.get("text")
                                if isinstance(text, str) and text.strip():
                                    return text

                        # Treat empty/non-text content as a model-level miss and continue fallback.
                        last_error = ValueError(f"Google model {model_name} returned no text candidate")
                        logger.warning("Google model %s returned no text candidate", model_name)
                        break
                    except httpx.HTTPStatusError as e:
                        last_http_error = e
                        last_error = e
                        status = e.response.status_code
                        if status == 429:
                            logger.warning(
                                "Google model %s rate-limited on key %d/%d, trying next key",
                                model_name,
                                key_index + 1,
                                len(self.api_keys),
                            )
                            continue
                        # Model not found/unavailable for this endpoint; move to next model.
                        if status == 404:
                            logger.warning(
                                "Google model %s returned HTTP 404, trying next model",
                                model_name,
                            )
                            model_missing = True
                            break
                        # Key-specific auth/permission failures can be retried with next key.
                        if status in (401, 403):
                            logger.warning(
                                "Google key %d/%d rejected with HTTP %s for model %s, trying next key",
                                key_index + 1,
                                len(self.api_keys),
                                status,
                                model_name,
                            )
                            continue
                        # For other HTTP errors (400/5xx/etc), fail fast and let provider chain continue.
                        raise
                    except Exception as e:
                        last_error = e
                        logger.warning(
                            "Google model %s failed on key %d/%d: %s",
                            model_name,
                            key_index + 1,
                            len(self.api_keys),
                            e,
                        )
                        continue

                if model_missing:
                    continue

        if last_http_error is not None:
            raise last_http_error
        if last_error is not None:
            raise RuntimeError(
                f"Google model fallback exhausted after trying {', '.join(tried_models)}. "
                f"Last error: {last_error}"
            )
        raise RuntimeError("Google model fallback exhausted with no response")

    async def is_available(self) -> bool:
        if not self.api_keys:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                for api_key in self.api_keys:
                    r = await client.get(
                        f"{self.BASE_URL}/models",
                        params={"key": api_key},
                    )
                    if r.status_code == 200:
                        return True
                    if r.status_code in (401, 403, 429):
                        continue
                return False
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                for api_key in self.api_keys:
                    r = await client.get(f"{self.BASE_URL}/models", params={"key": api_key})
                    if r.status_code in (401, 403, 429):
                        continue
                    r.raise_for_status()
                    return [m["name"].split("/")[-1] for m in r.json().get("models", [])]
                return list(self.MODEL_FALLBACK_ORDER)
        except Exception:
            return list(self.MODEL_FALLBACK_ORDER)
