"""Unit tests for multi-provider LLM failover, normalization, cooldowns, and demo quota protection."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from agent.llm import (
    LLMError,
    LLMResponse,
    get_llm_status,
    llm_call,
    redact_secrets,
    reset_llm_state,
)
from agent.orchestrator import RunState
from api.main import DEMO_GLOBAL_COUNTS, DEMO_IP_COUNTS, RUNS, app


@pytest.fixture(autouse=True)
def _clean_llm_state(monkeypatch):
    reset_llm_state()
    monkeypatch.setenv("LLM_PROVIDER_ORDER", "groq,cerebras,gemini")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_1234567890")
    monkeypatch.setenv("CEREBRAS_API_KEY", "csk-test-key-1234567890")
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaTestKey1234567890")
    yield
    reset_llm_state()


def _openai_tool_json(tool_name: str = "read_file", path: str = "src/App.tsx") -> dict:
    return {
        "choices": [
            {
                "message": {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps({"path": path}),
                            },
                        }
                    ],
                }
            }
        ],
        "usage": {"prompt_tokens": 120, "completion_tokens": 30},
    }


def test_failover_on_429_and_503_respects_order() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "groq.com" in url:
            calls.append("groq")
            return httpx.Response(
                429,
                json={"error": {"message": "Rate limit exceeded per day (RPD)"}},
            )
        if "cerebras.ai" in url:
            calls.append("cerebras")
            return httpx.Response(503, json={"error": {"message": "Service unavailable"}})
        raise AssertionError(f"Unexpected URL: {url}")

    transport = httpx.MockTransport(handler)
    with (
        httpx.Client(transport=transport) as mock_http,
        patch(
            "agent.llm._call_gemini",
            return_value=LLMResponse(
                provider="gemini",
                model="gemini-3.6-flash",
                text="Plan ready",
                tokens_in=50,
                tokens_out=20,
            ),
        ) as gem_mock,
    ):
        resp = llm_call(
            messages=[{"role": "user", "content": "hi"}],
            http_client=mock_http,
            sleep_fn=lambda _: None,
        )

    assert calls == ["groq", "cerebras", "cerebras"]
    assert gem_mock.called
    assert resp.provider == "gemini"
    assert resp.text == "Plan ready"


def test_no_failover_on_401_config_error() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(401, json={"error": {"message": "Invalid API key gsk_secret_999999"}})

    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as mock_http,
        pytest.raises(LLMError) as exc_info,
    ):
        llm_call(
            messages=[{"role": "user", "content": "hi"}],
            http_client=mock_http,
            sleep_fn=lambda _: None,
        )

    assert len(calls) == 1
    assert exc_info.value.kind == "provider_config_error"
    assert exc_info.value.provider == "groq"
    assert "gsk_secret" not in exc_info.value.message


def test_long_retry_429_triggers_cooldown_without_sleeping() -> None:
    sleeps: list[float] = []
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "groq.com" in url:
            calls.append("groq")
            return httpx.Response(
                429,
                headers={"Retry-After": "45"},
                json={"error": {"message": "Too many requests"}},
            )
        calls.append("cerebras")
        return httpx.Response(200, json=_openai_tool_json())

    with httpx.Client(transport=httpx.MockTransport(handler)) as mock_http:
        resp = llm_call(
            messages=[{"role": "user", "content": "hi"}],
            http_client=mock_http,
            sleep_fn=sleeps.append,
        )

    assert calls == ["groq", "cerebras"]
    assert sleeps == []
    assert resp.provider == "cerebras"
    status = get_llm_status()
    assert status["providers"]["groq"]["cooling_down_until"] is not None


def test_providers_without_keys_are_skipped(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("CEREBRAS_API_KEY", "your-cerebras-api-key-here")
    calls: list[str] = []

    with patch(
        "agent.llm._call_gemini",
        side_effect=lambda *a, **kw: (
            calls.append("gemini"),
            LLMResponse(provider="gemini", model="gemini-3.6-flash", text="ok"),
        )[1],
    ):
        resp = llm_call(messages=[{"role": "user", "content": "hi"}], sleep_fn=lambda _: None)

    assert calls == ["gemini"]
    assert resp.provider == "gemini"
    status = get_llm_status()
    assert status["providers"]["groq"]["configured"] is False
    assert status["providers"]["cerebras"]["configured"] is False
    assert status["providers"]["gemini"]["configured"] is True


def test_tool_call_normalization_across_providers() -> None:
    def groq_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_openai_tool_json("write_file", "src/cart.ts"))

    with httpx.Client(transport=httpx.MockTransport(groq_handler)) as mock_http:
        groq_resp = llm_call(
            messages=[{"role": "user", "content": "edit"}],
            tools=[{"name": "write_file", "description": "d", "input_schema": {"type": "object"}}],
            http_client=mock_http,
            sleep_fn=lambda _: None,
        )

    assert groq_resp.tool_calls[0].name == "write_file"
    assert groq_resp.tool_calls[0].args == {"path": "src/cart.ts"}

    fake_gem_resp = SimpleNamespace(
        usage_metadata=SimpleNamespace(prompt_token_count=90, candidates_token_count=15),
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(
                    parts=[
                        SimpleNamespace(
                            function_call=SimpleNamespace(
                                name="write_file",
                                args={"path": "src/cart.ts"},
                            ),
                            text=None,
                        )
                    ]
                )
            )
        ],
    )
    with patch("google.genai.Client") as client_cls:
        client_cls.return_value.models.generate_content.return_value = fake_gem_resp
        gem_resp = llm_call(
            messages=[{"role": "user", "content": "edit"}],
            preferred_provider="gemini",
            sleep_fn=lambda _: None,
        )

    assert gem_resp.tool_calls[0].name == groq_resp.tool_calls[0].name
    assert gem_resp.tool_calls[0].args == groq_resp.tool_calls[0].args


def test_quota_exhausted_does_not_consume_demo_quota_and_redacts_secrets(
    tmp_path: Path, monkeypatch
) -> None:
    RUNS.clear()
    DEMO_IP_COUNTS.clear()
    DEMO_GLOBAL_COUNTS.clear()
    monkeypatch.setenv("DEMO_MAX_RUNS_PER_IP_PER_DAY", "3")

    def fake_apply(case_id: str, workdir: Path) -> dict:
        workdir.mkdir(parents=True, exist_ok=True)
        return {"id": case_id}

    def fake_run_agent(item_id: str, config, on_event=None) -> RunState:
        detail = {
            "kind": "quota_exhausted",
            "provider": "gemini",
            "attempts": 6,
            "retry_after_s": 120,
        }
        msg = "Today's free AI capacity is used up. Please try again later."
        if on_event:
            on_event(
                {
                    "type": "done",
                    "status": "failed",
                    "error": msg,
                    "error_detail": detail,
                    "diff": "",
                    "tests_passed": False,
                }
            )
        return RunState(
            run_id="temp",
            item_id=item_id,
            status="failed",
            error=msg,
            error_detail=detail,
            provider="gemini",
        )

    client = TestClient(app)
    with (
        patch("api.main.RUNS_WORK_ROOT", tmp_path),
        patch("api.main.apply_case", side_effect=fake_apply),
        patch("api.main.run_agent", side_effect=fake_run_agent),
    ):
        res = client.post("/api/runs", json={"item_id": "BUG-1", "dry_run": True})
        assert res.status_code == 200
        run_id = res.json()["run_id"]
        import time

        for _ in range(20):
            state = client.get(f"/api/runs/{run_id}").json()
            if state["status"] == "failed":
                break
            time.sleep(0.05)

    assert state["error_detail"]["kind"] == "quota_exhausted"
    assert "RESOURCE_EXHAUSTED" not in (state["error"] or "")
    demo = client.get("/api/demo-status").json()
    assert demo["ip_remaining"] == 3

    llm_st = client.get("/api/llm/status").json()
    assert "gsk_" not in json.dumps(llm_st)
    assert redact_secrets("Bearer gsk_abc1234567890") == "[REDACTED]"
