import httpx
from typing import List
from app.llm.providers.base import BaseLLMProvider


class CerebrasProvider(BaseLLMProvider):
    name = "cerebras"
    BASE_URL = "https://api.cerebras.ai/v1"
    DEFAULT_MODEL = "qwen-3-235b-a22b-instruct-2507"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def generate(self, prompt: str, system_prompt: str = "", max_tokens: int = 4096) -> str:
        if not self.api_key:
            raise ValueError("Cerebras API key not set")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"model": self.DEFAULT_MODEL, "messages": messages, "max_tokens": max_tokens},
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

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
            return [self.DEFAULT_MODEL]
