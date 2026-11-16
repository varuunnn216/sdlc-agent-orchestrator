"""Multi-provider LLM abstraction with automatic failover, cooldowns, and quota tracking."""

from __future__ import annotations

import json
import logging
import os
import random
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger("agent.llm")

DEFAULT_PROVIDER_ORDER = ("groq", "cerebras", "gemini")
REQUEST_TIMEOUT_S = 60.0
MAX_ATTEMPTS_PER_PROVIDER = 2
SHORT_RETRY_MAX_S = 10.0

PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "default_model": "openai/gpt-oss-120b",
    },
    "cerebras": {
        "base_url": "https://api.cerebras.ai/v1",
        "key_env": "CEREBRAS_API_KEY",
        "model_env": "CEREBRAS_MODEL",
        "default_model": "gpt-oss-120b",
    },
    "gemini": {
        "base_url": "",
        "key_env": "GEMINI_API_KEY",
        "model_env": "GEMINI_MODEL",
        "default_model": "gemini-3.6-flash",
    },
}

_PLACEHOLDER_PREFIXES = ("your-", "replace-", "changeme")
_SECRET_RE = re.compile(
    r"(Bearer\s+[A-Za-z0-9\-_.]+|(?:gsk_|csk-|AIza|sk-ant-|sk-)[A-Za-z0-9\-_]{8,})"
)


def redact_secrets(text: str) -> str:
    """Redact API keys and bearer tokens from server log strings."""
    return _SECRET_RE.sub("[REDACTED]", text)


@dataclass
class NormalizedToolCall:
    """Normalized tool call returned by any LLM provider."""

    id: str
    name: str
    args: dict[str, Any]


@dataclass
class LLMResponse:
    """Normalized completion response from any LLM provider."""

    provider: str
    model: str
    text: str
    tool_calls: list[NormalizedToolCall] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    attempts: int = 1


class LLMError(Exception):
    """Typed, client-safe error raised when LLM calls fail."""

    def __init__(
        self,
        kind: str,
        message: str,
        provider: str = "",
        attempts: int = 0,
        retry_after_s: int | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.provider = provider
        self.attempts = attempts
        self.retry_after_s = retry_after_s

    def to_detail(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "provider": self.provider,
            "attempts": self.attempts,
            "retry_after_s": self.retry_after_s,
        }


_STATE_LOCK = threading.Lock()
_REQUESTS_TODAY: dict[tuple[str, str], int] = {}
_COOLING_DOWN_UNTIL: dict[str, float] = {}
_EXHAUSTED_TODAY: dict[tuple[str, str], bool] = {}


def reset_llm_state() -> None:
    """Clear in-memory quota and cooldown state (primarily for tests)."""
    with _STATE_LOCK:
        _REQUESTS_TODAY.clear()
        _COOLING_DOWN_UNTIL.clear()
        _EXHAUSTED_TODAY.clear()


def _today_key() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _seconds_until_utc_midnight() -> float:
    now = datetime.now(UTC)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(60.0, (tomorrow - now).total_seconds())


def _is_valid_key(value: str | None) -> bool:
    if not value:
        return False
    stripped = value.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    return not any(lower.startswith(p) for p in _PLACEHOLDER_PREFIXES)


def get_provider_order() -> list[str]:
    """Return configured provider order from LLM_PROVIDER_ORDER."""
    raw = os.getenv("LLM_PROVIDER_ORDER", "")
    if not raw.strip():
        return list(DEFAULT_PROVIDER_ORDER)
    order = [p.strip().lower() for p in raw.split(",") if p.strip()]
    return [p for p in order if p in PROVIDER_DEFAULTS]


def get_provider_model(provider: str) -> str:
    """Return configured model ID for a provider."""
    spec = PROVIDER_DEFAULTS[provider]
    return os.getenv(spec["model_env"], "").strip() or spec["default_model"]


def is_provider_configured(provider: str) -> bool:
    """Return True if the provider has a non-placeholder API key configured."""
    spec = PROVIDER_DEFAULTS.get(provider)
    if not spec:
        return False
    return _is_valid_key(os.getenv(spec["key_env"]))


def _mark_request(provider: str) -> None:
    day = _today_key()
    with _STATE_LOCK:
        _REQUESTS_TODAY[(day, provider)] = _REQUESTS_TODAY.get((day, provider), 0) + 1


def _mark_cooldown(provider: str, seconds: float, daily: bool = False) -> None:
    day = _today_key()
    until = time.time() + max(1.0, seconds)
    with _STATE_LOCK:
        _COOLING_DOWN_UNTIL[provider] = max(_COOLING_DOWN_UNTIL.get(provider, 0.0), until)
        if daily:
            _EXHAUSTED_TODAY[(day, provider)] = True


def _is_provider_available(provider: str) -> bool:
    day = _today_key()
    now = time.time()
    with _STATE_LOCK:
        if _EXHAUSTED_TODAY.get((day, provider), False):
            return False
        until = _COOLING_DOWN_UNTIL.get(provider, 0.0)
        if until > now:
            return False
        if until > 0.0:
            _COOLING_DOWN_UNTIL.pop(provider, None)
    return True


def get_llm_status() -> dict[str, Any]:
    """Return safe, key-free per-provider status for GET /api/llm/status."""
    day = _today_key()
    now = time.time()
    providers: dict[str, dict[str, Any]] = {}
    any_available = False

    with _STATE_LOCK:
        for name in get_provider_order():
            configured = is_provider_configured(name)
            until_ts = _COOLING_DOWN_UNTIL.get(name, 0.0)
            exhausted = _EXHAUSTED_TODAY.get((day, name), False)
            cooling = until_ts > now
            until_iso = (
                datetime.fromtimestamp(until_ts, tz=UTC).isoformat()
                if cooling
                else None
            )
            if configured and not cooling and not exhausted:
                any_available = True
            providers[name] = {
                "configured": configured,
                "model": get_provider_model(name),
                "cooling_down_until": until_iso,
                "exhausted_today": exhausted,
                "requests_today": _REQUESTS_TODAY.get((day, name), 0),
            }

    return {
        "capacity": "ok" if any_available else "limited",
        "providers": providers,
    }


def _parse_retry_after(headers: httpx.Headers | None, body_text: str) -> tuple[float | None, bool]:
    """Extract retry delay (seconds) and whether this is a daily quota error."""
    lower = body_text.lower()
    is_daily = any(
        kw in lower
        for kw in (
            "per day",
            "daily",
            "requests_per_day",
            "rpd",
            "tpd",
            "resource_exhausted",
            "exceeded your current quota",
        )
    )
    if headers:
        ra = headers.get("retry-after")
        if ra:
            try:
                return float(ra), is_daily
            except ValueError:
                pass
    match = re.search(r"retry(?:\s+in|\s+after)?\s+([0-9]+(?:\.[0-9]+)?)\s*s", lower)
    if match:
        return float(match.group(1)), is_daily
    return None, is_daily


class _ProviderCallError(Exception):
    def __init__(
        self,
        status_code: int | None,
        reason: str,
        retry_after_s: float | None = None,
        is_daily_quota: bool = False,
        config_error: bool = False,
    ) -> None:
        super().__init__(reason)
        self.status_code = status_code
        self.reason = reason
        self.retry_after_s = retry_after_s
        self.is_daily_quota = is_daily_quota
        self.config_error = config_error


def _to_openai_messages(system: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if system:
        out.append({"role": "system", "content": system})
    for msg in messages:
        role = msg["role"]
        if role == "tool":
            out.append(
                {
                    "role": "tool",
                    "tool_call_id": msg.get("tool_call_id", ""),
                    "content": json.dumps(msg.get("content", "")),
                }
            )
        elif role == "assistant" and msg.get("tool_calls"):
            out.append(
                {
                    "role": "assistant",
                    "content": msg.get("content") or "",
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc["args"]),
                            },
                        }
                        for tc in msg["tool_calls"]
                    ],
                }
            )
        else:
            out.append({"role": role, "content": msg.get("content", "")})
    return out


def _to_openai_tools(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    if not tools:
        return None
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


def _call_openai_compat(
    provider: str,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    max_tokens: int,
    http_client: httpx.Client | None = None,
) -> LLMResponse:
    spec = PROVIDER_DEFAULTS[provider]
    api_key = os.getenv(spec["key_env"], "").strip()
    url = f"{spec['base_url']}/chat/completions"

    payload: dict[str, Any] = {
        "model": model,
        "messages": _to_openai_messages(system, messages),
        "max_tokens": max_tokens,
    }
    openai_tools = _to_openai_tools(tools)
    if openai_tools:
        payload["tools"] = openai_tools
        payload["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        if http_client is not None:
            resp = http_client.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT_S)
        else:
            with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
                resp = client.post(url, json=payload, headers=headers)
    except (httpx.TimeoutException, httpx.ConnectError, httpx.TransportError) as exc:
        raise _ProviderCallError(status_code=None, reason=type(exc).__name__) from exc

    if resp.status_code in (400, 401, 403):
        if resp.status_code == 400 and "tool_use_failed" in resp.text:
            logger.warning("Provider %s tool_use_failed (400): %s", provider, redact_secrets(resp.text))
            raise _ProviderCallError(status_code=400, reason="tool_use_failed", config_error=False)
        logger.error("Provider %s config error (%s): %s", provider, resp.status_code, redact_secrets(resp.text))
        raise _ProviderCallError(
            status_code=resp.status_code,
            reason=f"HTTP {resp.status_code}",
            config_error=True,
        )

    if resp.status_code == 429:
        retry_after, is_daily = _parse_retry_after(resp.headers, resp.text)
        logger.warning("Provider %s rate-limited (429): %s", provider, redact_secrets(resp.text))
        raise _ProviderCallError(
            status_code=429,
            reason="429 rate limit",
            retry_after_s=retry_after,
            is_daily_quota=is_daily,
        )

    if resp.status_code >= 500:
        logger.warning("Provider %s server error (%s): %s", provider, resp.status_code, redact_secrets(resp.text))
        raise _ProviderCallError(status_code=resp.status_code, reason=f"HTTP {resp.status_code}")

    if resp.status_code >= 400:
        logger.warning("Provider %s error (%s): %s", provider, resp.status_code, redact_secrets(resp.text))
        raise _ProviderCallError(status_code=resp.status_code, reason=f"HTTP {resp.status_code}")

    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    text = (msg.get("content") or "").strip()

    tool_calls: list[NormalizedToolCall] = []
    for idx, tc in enumerate(msg.get("tool_calls") or []):
        fn = tc.get("function") or {}
        raw_args = fn.get("arguments") or "{}"
        try:
            parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
        except json.JSONDecodeError:
            parsed_args = {}
        tool_calls.append(
            NormalizedToolCall(
                id=tc.get("id") or f"{provider}-call-{idx}",
                name=fn.get("name", ""),
                args=parsed_args,
            )
        )

    usage = data.get("usage") or {}
    return LLMResponse(
        provider=provider,
        model=model,
        text=text,
        tool_calls=tool_calls,
        tokens_in=int(usage.get("prompt_tokens") or 0),
        tokens_out=int(usage.get("completion_tokens") or 0),
    )


def _call_gemini(
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    max_tokens: int,
) -> LLMResponse:
    from google import genai
    from google.genai import errors as genai_errors
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=int(REQUEST_TIMEOUT_S * 1000)),
    )

    contents: list[Any] = []
    for msg in messages:
        role = msg["role"]
        if role == "tool":
            contents.append(
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_function_response(
                            name=msg.get("name", "tool"),
                            response={"result": msg.get("content")},
                        )
                    ],
                )
            )
        elif role == "assistant" and msg.get("tool_calls"):
            parts = [
                types.Part.from_function_call(name=tc["name"], args=tc["args"])
                for tc in msg["tool_calls"]
            ]
            contents.append(types.Content(role="model", parts=parts))
        else:
            g_role = "model" if role == "assistant" else "user"
            contents.append(
                types.Content(
                    role=g_role,
                    parts=[types.Part.from_text(text=str(msg.get("content", "")))],
                )
            )

    cfg_kwargs: dict[str, Any] = {
        "system_instruction": system or None,
        "max_output_tokens": max_tokens,
    }
    if tools:
        declarations = [
            types.FunctionDeclaration(
                name=t["name"],
                description=t["description"],
                parameters_json_schema=t["input_schema"],
            )
            for t in tools
        ]
        cfg_kwargs["tools"] = [types.Tool(function_declarations=declarations)]
        cfg_kwargs["automatic_function_calling"] = types.AutomaticFunctionCallingConfig(disable=True)

    try:
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(**cfg_kwargs),
        )
    except genai_errors.APIError as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        body = redact_secrets(str(exc))
        if code in (400, 401, 403):
            logger.error("Gemini config error (%s): %s", code, body)
            raise _ProviderCallError(code, f"HTTP {code}", config_error=True) from exc
        if code == 429:
            retry_after, is_daily = _parse_retry_after(None, body)
            logger.warning("Gemini rate-limited (429): %s", body)
            raise _ProviderCallError(
                429,
                "429 rate limit",
                retry_after_s=retry_after,
                is_daily_quota=is_daily,
            ) from exc
        logger.warning("Gemini API error (%s): %s", code, body)
        raise _ProviderCallError(code, f"HTTP {code or 'error'}") from exc
    except Exception as exc:
        logger.warning("Gemini transport error: %s", redact_secrets(str(exc)))
        raise _ProviderCallError(None, type(exc).__name__) from exc

    usage = getattr(resp, "usage_metadata", None)
    t_in = getattr(usage, "prompt_token_count", 0) or 0
    t_out = getattr(usage, "candidates_token_count", 0) or 0

    candidate = resp.candidates[0].content if resp.candidates else None
    parts = candidate.parts if candidate else []
    tool_calls = [
        NormalizedToolCall(
            id=f"gemini-call-{idx}",
            name=p.function_call.name,
            args=dict(p.function_call.args or {}),
        )
        for idx, p in enumerate(parts)
        if getattr(p, "function_call", None)
    ]
    text_parts = [p.text for p in parts if getattr(p, "text", None)]
    return LLMResponse(
        provider="gemini",
        model=model,
        text="\n".join(text_parts).strip(),
        tool_calls=tool_calls,
        tokens_in=int(t_in),
        tokens_out=int(t_out),
    )


def _dispatch_provider(
    provider: str,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    max_tokens: int,
    http_client: httpx.Client | None = None,
) -> LLMResponse:
    if provider == "gemini":
        return _call_gemini(model, system, messages, tools, max_tokens)
    return _call_openai_compat(provider, model, system, messages, tools, max_tokens, http_client)


def llm_call(
    messages: list[dict[str, Any]],
    system: str = "",
    tools: list[dict[str, Any]] | None = None,
    max_tokens: int = 4096,
    preferred_provider: str | None = None,
    on_provider_switch: Callable[[str, str, str], None] | None = None,
    http_client: httpx.Client | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> LLMResponse:
    """Call configured LLM providers in order with retry, cooldown, and automatic failover."""
    order = get_provider_order()
    if preferred_provider and preferred_provider in order:
        candidates = [preferred_provider] + [p for p in order if p != preferred_provider]
    else:
        candidates = order

    configured_candidates = [p for p in candidates if is_provider_configured(p)]
    if not configured_candidates:
        raise LLMError(
            kind="provider_config_error",
            message="No LLM provider API keys are configured on the server.",
        )

    total_attempts = 0
    last_retry_after: int | None = None
    last_provider = configured_candidates[-1]
    switched_from: str | None = None
    switch_reason = ""

    for provider in configured_candidates:
        if not _is_provider_available(provider):
            if preferred_provider and provider == preferred_provider and switched_from is None:
                switched_from = provider
                switch_reason = "cooling down"
            continue

        model = get_provider_model(provider)
        if switched_from is not None and on_provider_switch is not None:
            on_provider_switch(switched_from, provider, switch_reason)
            switched_from = None

        for attempt in range(1, MAX_ATTEMPTS_PER_PROVIDER + 1):
            total_attempts += 1
            _mark_request(provider)
            try:
                resp = _dispatch_provider(
                    provider=provider,
                    model=model,
                    system=system,
                    messages=messages,
                    tools=tools,
                    max_tokens=max_tokens,
                    http_client=http_client,
                )
                resp.attempts = total_attempts
                return resp
            except _ProviderCallError as err:
                last_provider = provider
                if err.config_error:
                    raise LLMError(
                        kind="provider_config_error",
                        message=f"Server configuration error for {provider} ({err.reason}).",
                        provider=provider,
                        attempts=total_attempts,
                    ) from err

                if err.status_code == 429:
                    short_retry_max = float(
                        os.getenv("LLM_SHORT_RETRY_MAX_S", str(SHORT_RETRY_MAX_S))
                    )
                    if err.is_daily_quota or (
                        err.retry_after_s is not None and err.retry_after_s > short_retry_max
                    ):
                        cooldown = (
                            _seconds_until_utc_midnight()
                            if err.is_daily_quota
                            else float(err.retry_after_s or 60.0)
                        )
                        last_retry_after = round(cooldown)
                        _mark_cooldown(provider, cooldown, daily=err.is_daily_quota)
                        if preferred_provider and provider == preferred_provider:
                            switched_from = provider
                            switch_reason = "daily quota" if err.is_daily_quota else "rate limit"
                        break

                    if attempt < MAX_ATTEMPTS_PER_PROVIDER:
                        wait_s = float(err.retry_after_s) if err.retry_after_s is not None else 1.0
                        sleep_fn(min(short_retry_max, max(0.1, wait_s)) + random.uniform(0.5, 1.0))
                        continue

                    _mark_cooldown(provider, 30.0, daily=False)
                    if preferred_provider and provider == preferred_provider:
                        switched_from = provider
                        switch_reason = "429 rate limit"
                    break

                # 5xx / timeout / connection error
                if attempt < MAX_ATTEMPTS_PER_PROVIDER:
                    sleep_fn((0.5 * (2 ** (attempt - 1))) + random.uniform(0.0, 0.25))
                    continue

                _mark_cooldown(provider, 30.0, daily=False)
                if preferred_provider and provider == preferred_provider:
                    switched_from = provider
                    switch_reason = err.reason
                break

    retry_note = (
        f" Try again in ~{last_retry_after}s."
        if last_retry_after is not None and last_retry_after < 3600
        else ""
    )
    raise LLMError(
        kind="quota_exhausted",
        message=f"Today's free AI capacity is used up. Please try again later.{retry_note}",
        provider=last_provider,
        attempts=total_attempts,
        retry_after_s=last_retry_after,
    )
