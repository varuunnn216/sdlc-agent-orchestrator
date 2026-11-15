"""Unit tests for the agent loop, guardrails, approval gate, and JSON logging."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from agent.logger import RunLogger
from agent.orchestrator import AgentConfig, approve_run, reject_run, run_agent


@dataclass
class FakeUsage:
    input_tokens: int = 100
    output_tokens: int = 50


@dataclass
class FakeBlock:
    type: str
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict[str, Any] | None = None


@dataclass
class FakeResponse:
    content: list[Any]
    usage: FakeUsage
    stop_reason: str = "tool_use"


class FakeMessages:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def create(self, **kwargs: Any) -> FakeResponse:
        _ = kwargs
        resp = self._responses[min(self.calls, len(self._responses) - 1)]
        self.calls += 1
        return resp


class FakeAnthropic:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.messages = FakeMessages(responses)


@pytest.fixture()
def git_workdir(tmp_path: Path) -> Path:
    workdir = tmp_path / "workdir"
    workdir.mkdir()
    (workdir / "src" / "utils").mkdir(parents=True)
    (workdir / "src" / "utils" / "cart.ts").write_text("export const x = 1;\n", encoding="utf-8")

    subprocess.run(["git", "init", "-q"], cwd=workdir, check=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=workdir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=workdir, check=True)
    subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "seed"], cwd=workdir, check=True)
    return workdir


def test_agent_plan_implement_verify_and_approval_gate(
    git_workdir: Path, tmp_path: Path
) -> None:
    log_dir = tmp_path / "logs"
    events: list[dict[str, Any]] = []

    client = FakeAnthropic(
        [
            FakeResponse(
                content=[FakeBlock(type="text", text="1. Read cart.ts\n2. Fix bug\n3. Run tests")],
                usage=FakeUsage(120, 40),
                stop_reason="end_turn",
            ),
            FakeResponse(
                content=[
                    FakeBlock(type="tool_use", id="t1", name="read_file", input={"path": "src/utils/cart.ts"}),
                    FakeBlock(
                        type="tool_use",
                        id="t2",
                        name="write_file",
                        input={"path": "src/utils/cart.ts", "content": "export const x = 2;\n"},
                    ),
                    FakeBlock(type="tool_use", id="t3", name="run_tests", input={}),
                ],
                usage=FakeUsage(200, 80),
                stop_reason="end_turn",
            ),
        ]
    )

    cfg = AgentConfig(workdir=git_workdir, log_dir=log_dir, dry_run=True)
    with patch("agent.orchestrator.run_tests", return_value={"passed": True, "returncode": 0, "output": "ok"}):
        state = run_agent("BUG-1", config=cfg, client=client, on_event=events.append)

    assert state.status == "awaiting_approval"
    assert state.tests_passed is True
    assert state.tool_calls == 3
    assert state.total_tokens == 440
    assert "-export const x = 1;" in state.diff
    assert "+export const x = 2;" in state.diff
    assert any(e["type"] == "plan" for e in events)
    assert any(e["type"] == "done" for e in events)

    # Verify nothing was committed yet
    git_log = subprocess.run(
        ["git", "log", "--oneline"], cwd=git_workdir, capture_output=True, text=True, check=True
    ).stdout.strip().splitlines()
    assert len(git_log) == 1

    # Verify JSON log file
    log_file = log_dir / f"{state.run_id}.json"
    assert log_file.exists()
    data = json.loads(log_file.read_text(encoding="utf-8"))
    assert len(data["steps"]) == 4  # 1 plan + 3 tools
    assert data["steps"][0]["phase"] == "plan"

    # Explicit approve opens dry-run PR
    logger = RunLogger(state.run_id, state.item_id, log_dir=log_dir)
    approved = approve_run(state, config=cfg, logger=logger)
    assert approved.status == "approved"
    assert approved.pr_result is not None
    assert approved.pr_result["dry_run"] is True


def test_agent_reject_logs_reason_without_committing(git_workdir: Path, tmp_path: Path) -> None:
    log_dir = tmp_path / "logs"
    logger = RunLogger("run-123", "BUG-1", log_dir=log_dir)
    from agent.orchestrator import RunState

    state = RunState(run_id="run-123", item_id="BUG-1", status="awaiting_approval")
    rejected = reject_run(state, reason="Missing edge case", logger=logger)

    assert rejected.status == "rejected"
    assert rejected.reject_reason == "Missing edge case"
    data = json.loads((log_dir / "run-123.json").read_text(encoding="utf-8"))
    assert data["metadata"]["reject_reason"] == "Missing edge case"


def test_agent_enforces_max_tool_calls_and_token_budget(
    git_workdir: Path, tmp_path: Path
) -> None:
    loop_resp = FakeResponse(
        content=[FakeBlock(type="tool_use", id="t", name="read_file", input={"path": "src/utils/cart.ts"})],
        usage=FakeUsage(10, 10),
        stop_reason="tool_use",
    )
    plan_resp = FakeResponse(
        content=[FakeBlock(type="text", text="Plan")],
        usage=FakeUsage(10, 10),
        stop_reason="end_turn",
    )
    client = FakeAnthropic([plan_resp, loop_resp])

    cfg = AgentConfig(workdir=git_workdir, log_dir=tmp_path / "logs", max_tool_calls=3)
    state = run_agent("BUG-1", config=cfg, client=client)
    assert state.status == "budget_exceeded"
    assert state.tool_calls == 3

    token_client = FakeAnthropic([plan_resp, loop_resp])
    token_cfg = AgentConfig(workdir=git_workdir, log_dir=tmp_path / "logs2", max_tokens_per_run=30)
    token_state = run_agent("BUG-1", config=token_cfg, client=token_client)
    assert token_state.status == "budget_exceeded"


def test_agent_stops_after_max_test_retries(git_workdir: Path, tmp_path: Path) -> None:
    plan_resp = FakeResponse(
        content=[FakeBlock(type="text", text="Plan")],
        usage=FakeUsage(10, 10),
        stop_reason="end_turn",
    )
    fail_test_resp = FakeResponse(
        content=[FakeBlock(type="tool_use", id="t", name="run_tests", input={})],
        usage=FakeUsage(10, 10),
        stop_reason="tool_use",
    )
    client = FakeAnthropic([plan_resp, fail_test_resp])
    cfg = AgentConfig(workdir=git_workdir, log_dir=tmp_path / "logs", max_test_retries=2)

    with patch("agent.orchestrator.run_tests", return_value={"passed": False, "returncode": 1, "output": "fail"}):
        state = run_agent("BUG-1", config=cfg, client=client)

    assert state.status == "failed"
    assert state.tool_calls == 3  # 1 initial + 2 retries
    assert "2 retries" in (state.error or "")
