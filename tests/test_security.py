"""Security & sandbox hardening tests."""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from agent.orchestrator import RunState
from api.main import DEMO_GLOBAL_COUNTS, DEMO_IP_COUNTS, RUNS, app
from mcp_server.tools import MCPConfig, open_pr, read_file, run_tests, write_file


def test_run_tests_uses_clean_env_without_secrets(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSecretShouldNotLeak")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_SecretShouldNotLeak")
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_SecretShouldNotLeak")

    captured_env: dict[str, str] = {}

    def fake_run(cmd, cwd, env, capture_output, text, timeout, check):
        captured_env.update(env)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    with patch("mcp_server.tools.subprocess.run", side_effect=fake_run):
        res = run_tests(config=MCPConfig(workdir=tmp_path), timeout=30)

    assert res["passed"] is True
    assert "GEMINI_API_KEY" not in captured_env
    assert "GROQ_API_KEY" not in captured_env
    assert "GITHUB_TOKEN" not in captured_env
    assert captured_env["NODE_ENV"] == "test"


def test_prompt_injection_cannot_escape_sandbox_or_force_real_pr(tmp_path: Path) -> None:
    cfg = MCPConfig(workdir=tmp_path, dry_run=True, github_token="ghp_ShouldNeverBeUsed")
    # Even if an adversarial ticket asks to read /etc/passwd or ../.env
    for bad_path in ("/etc/passwd", "../.env", ".git/config", "node_modules/x.js"):
        with pytest.raises(ValueError):
            read_file(bad_path, config=cfg)
        with pytest.raises(ValueError):
            write_file(bad_path, "pwned", config=cfg)

    # Even if open_pr is called, dry_run=True simulates without hitting GitHub
    pr = open_pr(branch="fix/injected", title="Injected", body="Body", config=cfg)
    assert pr["dry_run"] is True
    assert pr["status"] == "simulated"


def test_api_security_headers_body_cap_proxy_ip_and_workdir_cleanup(
    tmp_path: Path, monkeypatch
) -> None:
    RUNS.clear()
    DEMO_IP_COUNTS.clear()
    DEMO_GLOBAL_COUNTS.clear()
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    monkeypatch.setenv("DEMO_MAX_RUNS_PER_IP_PER_DAY", "1")

    client = TestClient(app)

    # Security headers present
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert "camera=()" in health.headers["permissions-policy"]

    # Oversized body (> 64 KB) rejected with 413
    oversized = {"item_id": "BUG-1", "padding": "x" * (70 * 1024)}
    big_res = client.post("/api/runs", json=oversized)
    assert big_res.status_code == 413

    def fake_apply(case_id: str, workdir: Path) -> dict:
        workdir.mkdir(parents=True, exist_ok=True)
        (workdir / "dummy.txt").write_text("hi", encoding="utf-8")
        return {"id": case_id}

    def fake_run_agent(item_id: str, config, on_event=None) -> RunState:
        return RunState(
            run_id="temp",
            item_id=item_id,
            status="awaiting_approval",
            diff="+fixed",
            tests_passed=True,
        )

    with (
        patch("api.main.RUNS_WORK_ROOT", tmp_path),
        patch("api.main.apply_case", side_effect=fake_apply),
        patch("api.main.run_agent", side_effect=fake_run_agent),
    ):
        r1 = client.post(
            "/api/runs",
            json={"item_id": "BUG-1", "dry_run": True},
            headers={"X-Forwarded-For": "1.1.1.1"},
        )
        assert r1.status_code == 200
        run_id = r1.json()["run_id"]
        assert (tmp_path / run_id).exists()

        # Spoofing X-Forwarded-For does NOT bypass rate limit when TRUST_PROXY is false
        r2 = client.post(
            "/api/runs",
            json={"item_id": "BUG-2", "dry_run": True},
            headers={"X-Forwarded-For": "9.9.9.9"},
        )
        assert r2.status_code == 429

        # Reject cleans up working directory
        rej = client.post(f"/api/runs/{run_id}/reject", json={"reason": "done"})
        assert rej.status_code == 200
        assert not (tmp_path / run_id).exists()
