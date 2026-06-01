import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Callable
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

from app.llm.providers.cerebras import CerebrasProvider
from app.llm.providers.groq import GroqProvider
from app.llm.providers.google import GoogleProvider
from app.llm.providers.openrouter import OpenRouterProvider
from app.llm.providers.ollama import OllamaProvider
from app.llm.providers.lmstudio import LMStudioProvider

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    pass


class AllProvidersFailedError(Exception):
    pass


_provider_cooldowns: Dict[str, datetime] = {}
_provider_in_use_counts: Dict[str, int] = {}
_provider_recently_used_until: Dict[str, datetime] = {}
_provider_availability_cache: Dict[str, Dict[str, Any]] = {}
_last_successful_provider: Optional[str] = None


def _prioritize_lmstudio_before_ollama(fallback_order: List[str]) -> List[str]:
    """Keep order stable, but ensure LM Studio is tried before Ollama when both are present."""
    order = [p for p in fallback_order if p not in ("lmstudio", "ollama")]
    if "lmstudio" in fallback_order:
        order.append("lmstudio")
    if "ollama" in fallback_order:
        order.append("ollama")
    return order


def _runtime_order_for_try(fallback_order: List[str]) -> List[str]:
    """Prioritize the most recently successful provider; otherwise prefer OpenRouter first."""
    order = list(dict.fromkeys(fallback_order))
    global _last_successful_provider
    if _last_successful_provider and _last_successful_provider in order:
        order.remove(_last_successful_provider)
        order.insert(0, _last_successful_provider)
        return order

    if "openrouter" in order:
        order.remove("openrouter")
        order.insert(0, "openrouter")
    return order


def _local_only_order(fallback_order: List[str]) -> List[str]:
    """Build a local-only order, preferring LM Studio before Ollama."""
    prioritized = _prioritize_lmstudio_before_ollama(fallback_order)
    local = [p for p in prioritized if p in ("lmstudio", "ollama")]
    # If profile order is missing both locals, still try the conventional local fallback.
    return local or ["lmstudio", "ollama"]


def _cooldown_remaining_seconds(provider_name: str) -> float:
    until = _provider_cooldowns.get(provider_name)
    if until is None:
        return 0.0
    remaining = (until - datetime.utcnow()).total_seconds()
    return max(0.0, remaining)


def _is_local_provider(provider_name: str) -> bool:
    return provider_name in ("lmstudio", "ollama")


def _availability_cache_ttl_seconds(provider_name: str) -> int:
    # Local providers can come up/down quickly; cloud providers are usually stable enough for a longer TTL.
    return 6 if _is_local_provider(provider_name) else 20


def _cache_provider_availability(provider_name: str, available: bool) -> None:
    _provider_availability_cache[provider_name] = {
        "available": bool(available),
        "checked_at": datetime.utcnow(),
    }


def _get_cached_provider_availability(provider_name: str) -> Optional[bool]:
    cached = _provider_availability_cache.get(provider_name)
    if not cached:
        return None
    checked_at = cached.get("checked_at")
    if not isinstance(checked_at, datetime):
        return None
    age = (datetime.utcnow() - checked_at).total_seconds()
    if age > _availability_cache_ttl_seconds(provider_name):
        return None
    return bool(cached.get("available", False))


def _mark_provider_recently_used(provider_name: str, seconds: int = 8) -> None:
    until = datetime.utcnow() + timedelta(seconds=max(1, seconds))
    prev = _provider_recently_used_until.get(provider_name)
    if prev is None or until > prev:
        _provider_recently_used_until[provider_name] = until


def _recently_used_remaining_seconds(provider_name: str) -> float:
    until = _provider_recently_used_until.get(provider_name)
    if until is None:
        return 0.0
    remaining = (until - datetime.utcnow()).total_seconds()
    if remaining <= 0:
        _provider_recently_used_until.pop(provider_name, None)
        return 0.0
    return remaining


def _set_provider_cooldown(provider_name: str, seconds: int, reason: str) -> None:
    if seconds <= 0:
        return
    until = datetime.utcnow() + timedelta(seconds=seconds)
    prev = _provider_cooldowns.get(provider_name)
    if prev is None or until > prev:
        _provider_cooldowns[provider_name] = until
    logger.warning(
        "Provider %s entering cooldown for %ss (%s)",
        provider_name,
        seconds,
        reason,
    )


def _mark_provider_in_use(provider_name: str) -> None:
    _provider_in_use_counts[provider_name] = _provider_in_use_counts.get(provider_name, 0) + 1
    _mark_provider_recently_used(provider_name, seconds=12)


def _unmark_provider_in_use(provider_name: str) -> None:
    active = _provider_in_use_counts.get(provider_name, 0)
    if active <= 1:
        _provider_in_use_counts.pop(provider_name, None)
    else:
        _provider_in_use_counts[provider_name] = active - 1


def _runtime_provider_status(provider_name: str) -> Dict[str, Any]:
    in_use_count = max(0, int(_provider_in_use_counts.get(provider_name, 0)))
    recently_used_s = round(_recently_used_remaining_seconds(provider_name), 2)
    return {
        "in_use": in_use_count > 0,
        "in_use_count": in_use_count,
        "recently_used": recently_used_s > 0,
        "recently_used_s": recently_used_s,
        "cooldown_remaining_s": round(_cooldown_remaining_seconds(provider_name), 2),
    }


def _append_telemetry(telemetry: Optional[List[Dict[str, Any]]], event: Dict[str, Any]) -> None:
    if telemetry is None:
        return
    telemetry.append(event)
    # Cap in-memory growth for long batch runs.
    if len(telemetry) > 1000:
        del telemetry[:len(telemetry) - 1000]


def build_providers_for_profile(llm_settings) -> Dict[str, Any]:
    """Build provider instances from a profile's LLM settings."""
    return {
        "cerebras": CerebrasProvider(api_key=llm_settings.cerebras_api_key or ""),
        "groq": GroqProvider(api_key=llm_settings.groq_api_key or ""),
        "google": GoogleProvider(api_key=llm_settings.google_ai_api_key or ""),
        "openrouter": OpenRouterProvider(api_key=llm_settings.openrouter_api_key or ""),
        "ollama": OllamaProvider(
            base_url=llm_settings.ollama_base_url or "http://localhost:11434",
            model=llm_settings.active_local_model_ollama or "",
        ),
        "lmstudio": LMStudioProvider(
            base_url=llm_settings.lmstudio_base_url or "http://localhost:1234",
            model=llm_settings.active_local_model_lmstudio or "",
        ),
    }


def build_providers_from_settings(app_settings) -> Dict[str, Any]:
    """Build providers from global app settings (used before profile is set)."""
    return {
        "cerebras": CerebrasProvider(api_key=app_settings.CEREBRAS_API_KEY),
        "groq": GroqProvider(api_key=app_settings.GROQ_API_KEY),
        "google": GoogleProvider(api_key=app_settings.GOOGLE_AI_API_KEY),
        "openrouter": OpenRouterProvider(api_key=app_settings.OPENROUTER_API_KEY),
        "ollama": OllamaProvider(base_url=app_settings.OLLAMA_BASE_URL),
        "lmstudio": LMStudioProvider(base_url=app_settings.LMSTUDIO_BASE_URL),
    }


class LLMFallbackChain:
    def __init__(self, providers: Dict[str, Any], fallback_order: List[str]):
        self.providers = providers
        self.fallback_order = fallback_order

    async def try_generate(
        self,
        prompt: str,
        system_prompt: str = "",
        max_tokens: int = 4096,
        validate_response: Optional[Callable[[str], None]] = None,
        telemetry: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        errors = []
        call_started = datetime.utcnow().isoformat() + "Z"
        provider_order = _runtime_order_for_try(self.fallback_order)

        for provider_name in provider_order:
            provider = self.providers.get(provider_name)
            if not provider:
                continue

            cooldown_remaining = _cooldown_remaining_seconds(provider_name)
            if cooldown_remaining > 0:
                logger.info(
                    "Provider %s on cooldown for %.1fs, skipping",
                    provider_name,
                    cooldown_remaining,
                )
                _append_telemetry(telemetry, {
                    "ts": datetime.utcnow().isoformat() + "Z",
                    "call_started_at": call_started,
                    "provider": provider_name,
                    "status": "cooldown_skip",
                    "cooldown_remaining_s": round(cooldown_remaining, 2),
                })
                errors.append(f"{provider_name}: cooldown ({cooldown_remaining:.1f}s)")
                continue

            try:
                attempt_started = time.perf_counter()
                available = await provider.is_available()
                _cache_provider_availability(provider_name, available)
                if not available:
                    logger.info(f"Provider {provider_name} not available, skipping")
                    _append_telemetry(telemetry, {
                        "ts": datetime.utcnow().isoformat() + "Z",
                        "call_started_at": call_started,
                        "provider": provider_name,
                        "status": "unavailable",
                        "duration_ms": int((time.perf_counter() - attempt_started) * 1000),
                    })
                    _set_provider_cooldown(provider_name, 20, "unavailable")
                    continue

                logger.info(f"Trying provider: {provider_name}")
                _mark_provider_in_use(provider_name)
                try:
                    result = await self._generate_with_retry(provider, prompt, system_prompt, max_tokens)
                finally:
                    _unmark_provider_in_use(provider_name)
                duration_ms = int((time.perf_counter() - attempt_started) * 1000)

                if not isinstance(result, str) or not result.strip():
                    raise ValueError("Provider returned an empty response")

                if validate_response is not None:
                    try:
                        validate_response(result)
                    except Exception as e:
                        logger.warning(f"Invalid response from {provider_name}: {e}")
                        _append_telemetry(telemetry, {
                            "ts": datetime.utcnow().isoformat() + "Z",
                            "call_started_at": call_started,
                            "provider": provider_name,
                            "status": "invalid_response",
                            "duration_ms": duration_ms,
                            "error": str(e),
                        })
                        _set_provider_cooldown(provider_name, 45, "invalid response")
                        errors.append(f"{provider_name}: invalid response ({e})")
                        continue

                logger.info(f"Success with provider: {provider_name}")
                global _last_successful_provider
                _last_successful_provider = provider_name
                _provider_cooldowns.pop(provider_name, None)
                _cache_provider_availability(provider_name, True)
                _append_telemetry(telemetry, {
                    "ts": datetime.utcnow().isoformat() + "Z",
                    "call_started_at": call_started,
                    "provider": provider_name,
                    "status": "success",
                    "duration_ms": duration_ms,
                })
                return result

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if e.response.status_code == 429:
                    logger.warning(f"Rate limited by {provider_name}, trying next")
                    _set_provider_cooldown(provider_name, 90, "rate limited")
                    _append_telemetry(telemetry, {
                        "ts": datetime.utcnow().isoformat() + "Z",
                        "call_started_at": call_started,
                        "provider": provider_name,
                        "status": "rate_limited",
                        "http_status": status,
                    })
                    errors.append(f"{provider_name}: rate limited")
                else:
                    logger.warning(f"HTTP error from {provider_name}: {e}")
                    if status in (401, 403, 404):
                        _set_provider_cooldown(provider_name, 300, f"HTTP {status}")
                    else:
                        _set_provider_cooldown(provider_name, 60, f"HTTP {status}")
                    _append_telemetry(telemetry, {
                        "ts": datetime.utcnow().isoformat() + "Z",
                        "call_started_at": call_started,
                        "provider": provider_name,
                        "status": "http_error",
                        "http_status": status,
                        "error": str(e),
                    })
                    errors.append(f"{provider_name}: HTTP {status}")
                    if status in (401, 403, 404):
                        _cache_provider_availability(provider_name, False)
            except Exception as e:
                logger.warning(f"Error from {provider_name}: {e}")
                _set_provider_cooldown(provider_name, 30, "runtime error")
                _append_telemetry(telemetry, {
                    "ts": datetime.utcnow().isoformat() + "Z",
                    "call_started_at": call_started,
                    "provider": provider_name,
                    "status": "error",
                    "error": str(e),
                })
                errors.append(f"{provider_name}: {str(e)}")

        raise AllProvidersFailedError(
            f"All LLM providers failed. Errors: {'; '.join(errors)}"
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.TimeoutException),
    )
    async def _generate_with_retry(self, provider, prompt: str, system_prompt: str, max_tokens: int) -> str:
        return await provider.generate(prompt, system_prompt, max_tokens)

    async def get_available_providers(self) -> List[Dict[str, Any]]:
        checks = []
        for name in self.fallback_order:
            provider = self.providers.get(name)
            if provider:
                checks.append((name, provider))

        async def _check_provider(name: str, provider: Any) -> Dict[str, Any]:
            runtime = _runtime_provider_status(name)
            if runtime["in_use"]:
                # If a provider is currently serving a request, treat it as available and skip extra probe load.
                available = True
            elif runtime["cooldown_remaining_s"] > 0:
                # Avoid probe spam for providers that are intentionally cooling down.
                available = False
            else:
                cached = _get_cached_provider_availability(name)
                if cached is not None:
                    available = cached
                else:
                    try:
                        available = await provider.is_available()
                    except Exception:
                        available = False
                    _cache_provider_availability(name, available)
            return {
                "name": name,
                "available": available,
                **runtime,
            }

        results = await asyncio.gather(*[_check_provider(name, provider) for name, provider in checks])
        return list(results)


async def get_chain_for_profile(profile_id: str, db) -> LLMFallbackChain:
    """Get a fallback chain configured for a specific profile."""
    from app.db.models import LLMSettings
    llm_settings = db.query(LLMSettings).filter(LLMSettings.profile_id == profile_id).first()

    if llm_settings:
        providers = build_providers_for_profile(llm_settings)
        fallback_order = llm_settings.fallback_order or ["cerebras", "groq", "google", "openrouter", "lmstudio", "ollama"]
    else:
        from app.core.config import settings
        providers = build_providers_from_settings(settings)
        fallback_order = settings.LLM_FALLBACK_ORDER

    return LLMFallbackChain(
        providers=providers,
        fallback_order=_prioritize_lmstudio_before_ollama(fallback_order),
    )


async def get_local_chain_for_profile(profile_id: str, db) -> LLMFallbackChain:
    """Get a local-only fallback chain (LM Studio/Ollama) for a specific profile."""
    from app.db.models import LLMSettings
    llm_settings = db.query(LLMSettings).filter(LLMSettings.profile_id == profile_id).first()

    if llm_settings:
        providers = build_providers_for_profile(llm_settings)
        fallback_order = llm_settings.fallback_order or ["lmstudio", "ollama"]
    else:
        from app.core.config import settings
        providers = build_providers_from_settings(settings)
        fallback_order = settings.LLM_FALLBACK_ORDER

    return LLMFallbackChain(
        providers=providers,
        fallback_order=_local_only_order(fallback_order),
    )
