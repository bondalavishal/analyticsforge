import httpx
from typing import List
import os
from app.llm.providers.base import BaseLLMProvider


class LMStudioProvider(BaseLLMProvider):
    name = "lmstudio"

    def __init__(self, base_url: str = "http://localhost:1234", model: str = "", api_token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.model = model
        # Supports LM Studio servers with "Require Authentication" enabled.
        self.api_token = api_token or os.getenv("LM_API_TOKEN", "")

    def _headers(self) -> dict:
        if self.api_token:
            return {"Authorization": f"Bearer {self.api_token}"}
        return {}

    async def generate(self, prompt: str, system_prompt: str = "", max_tokens: int = 4096) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.7,
        }
        if self.model:
            payload["model"] = self.model

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/v1/models", headers=self._headers())
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.base_url}/v1/models", headers=self._headers())
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
        except Exception:
            return []
