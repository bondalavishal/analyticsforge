from abc import ABC, abstractmethod
from typing import List


class BaseLLMProvider(ABC):
    name: str = ""

    @abstractmethod
    async def generate(self, prompt: str, system_prompt: str = "", max_tokens: int = 4096) -> str:
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        pass

    @abstractmethod
    async def list_models(self) -> List[str]:
        pass
