"""Tests for FastAPI endpoints, run lifecycle, and approval/rejection gates."""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from agent.orchestrator import RunState
from api.main import RUNS, app

client = TestClient(app)


def test_health_and_work_items() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

    all_items = client.get("/api/work-items").json()
    assert len(all_items) == 16

    bugs = client.get("/api/work-items?type=bug").json()
    assert len(bugs) == 6
    assert all(b["type"] == "bug" for b in bugs)


def test_run_lifecycle_approve_and_reject(tmp_path: Path) -> None:
    RUNS.clear()

    def fake_apply(case_id: str, workdir: Path) -> dict:
        workdir.mkdir(parents=True, exist_ok=True)
        return {"id": case_id}

    def fake_run_agent(item_id: str, config, on_event=None) -> RunState:
        if on_event:
            on_event({"type": "plan", "plan": "1. Fix bug"})
            on_event({"type": "done", "status": "awaiting_approval", "diff": "+fixed", "tests_passed": True})
        return RunState(
            run_id="temp",
            item_id=item_id,
            status="awaiting_approval",
            plan="1. Fix bug",
            diff="+fixed",
            tests_passed=True,
        )

    with (
        patch("api.main.RUNS_WORK_ROOT", tmp_path),
        patch("api.main.apply_case", side_effect=fake_apply),
        patch("api.main.run_agent", side_effect=fake_run_agent),
    ):
        start_res = client.post("/api/runs", json={"item_id": "BUG-1", "dry_run": True})
        assert start_res.status_code == 200
        run_id = start_res.json()["run_id"]

        # Wait briefly for background thread
        for _ in range(20):
            state_res = client.get(f"/api/runs/{run_id}").json()
            if state_res["status"] == "awaiting_approval":
                break
            time.sleep(0.05)

        assert state_res["status"] == "awaiting_approval"
        assert state_res["diff"] == "+fixed"

        approve_res = client.post(f"/api/runs/{run_id}/approve")
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "approved"
        assert approve_res.json()["pr_result"]["dry_run"] is True

        # Start a second run and reject it
        start_res2 = client.post("/api/runs", json={"item_id": "BUG-2", "dry_run": True})
        run_id2 = start_res2.json()["run_id"]
        for _ in range(20):
            if client.get(f"/api/runs/{run_id2}").json()["status"] == "awaiting_approval":
                break
            time.sleep(0.05)

        reject_res = client.post(f"/api/runs/{run_id2}/reject", json={"reason": "Needs cleanup"})
        assert reject_res.status_code == 200
        assert reject_res.json()["status"] == "rejected"
        assert reject_res.json()["reject_reason"] == "Needs cleanup"
