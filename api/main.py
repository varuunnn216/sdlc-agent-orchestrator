"""FastAPI endpoints and SSE stream for SDLC Agent Orchestrator."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from apply_case import apply_case

from agent.llm import get_llm_status, redact_secrets
from agent.logger import DEFAULT_LOG_DIR, RunLogger
from agent.orchestrator import (
    AgentConfig,
    RunState,
    approve_run,
    reject_run,
    run_agent,
)
from mcp_server.tools import list_work_items

RUNS_WORK_ROOT = REPO_ROOT / ".work" / "runs"

app = FastAPI(title="SDLC Agent Orchestrator API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartRunRequest(BaseModel):
    item_id: str
    dry_run: bool = True


class RejectRunRequest(BaseModel):
    reason: str = "Rejected by reviewer"


@dataclass
class RunRecord:
    run_id: str
    item_id: str
    workdir: Path
    config: AgentConfig
    state: RunState
    events: list[dict[str, Any]] = field(default_factory=list)
    subscribers: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]] = field(
        default_factory=list
    )
    lock: threading.Lock = field(default_factory=threading.Lock)

    def publish(self, event: dict[str, Any]) -> None:
        with self.lock:
            self.events.append(event)
            subs = list(self.subscribers)
        for loop, queue in subs:
            loop.call_soon_threadsafe(queue.put_nowait, event)


RUNS: dict[str, RunRecord] = {}
DEMO_USAGE_LOCK = threading.Lock()
DEMO_IP_COUNTS: dict[tuple[str, str], int] = {}
DEMO_GLOBAL_COUNTS: dict[str, int] = {}


def _today_key() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _ip_daily_limit() -> int:
    return max(1, int(os.getenv("DEMO_MAX_RUNS_PER_IP_PER_DAY", "5")))


def _global_daily_limit() -> int:
    return max(1, int(os.getenv("DEMO_MAX_GLOBAL_RUNS_PER_DAY", "50")))


def _allow_real_pr() -> bool:
    return os.getenv("ALLOW_REAL_PR", "").strip().lower() in {"1", "true", "yes"}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.get("/api/health")
def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/llm/status")
def llm_status() -> dict[str, Any]:
    """Return per-provider configuration, cooldown, and daily request counts (no keys)."""
    return get_llm_status()


@app.get("/api/demo-status")
def demo_status(request: Request) -> dict[str, Any]:
    """Return remaining public demo run quota and PR guardrail status."""
    day = _today_key()
    ip = _client_ip(request)
    ip_limit = _ip_daily_limit()
    global_limit = _global_daily_limit()
    with DEMO_USAGE_LOCK:
        ip_used = DEMO_IP_COUNTS.get((day, ip), 0)
        global_used = DEMO_GLOBAL_COUNTS.get(day, 0)
    return {
        "demo_mode": True,
        "ip_remaining": max(0, ip_limit - ip_used),
        "ip_limit": ip_limit,
        "global_remaining": max(0, global_limit - global_used),
        "global_limit": global_limit,
        "real_pr_enabled": _allow_real_pr(),
    }


@app.get("/api/work-items")
def get_work_items(type: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    """Return mock backlog work items."""
    return list_work_items(item_type=type, status=status)


@app.post("/api/runs")
def start_run(request: Request, req: StartRunRequest) -> dict[str, Any]:
    """Apply a case to an isolated working copy and start the agent in a background thread."""
    day = _today_key()
    ip = _client_ip(request)
    ip_limit = _ip_daily_limit()
    global_limit = _global_daily_limit()

    with DEMO_USAGE_LOCK:
        ip_used = DEMO_IP_COUNTS.get((day, ip), 0)
        global_used = DEMO_GLOBAL_COUNTS.get(day, 0)
        if ip_used >= ip_limit or global_used >= global_limit:
            raise HTTPException(
                status_code=429,
                detail="Daily demo run limit reached. Please try again tomorrow or run locally with your own API key.",
            )

    run_id = f"{req.item_id.lower()}-{uuid.uuid4().hex[:8]}"
    workdir = RUNS_WORK_ROOT / run_id
    try:
        apply_case(req.item_id, workdir=workdir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    with DEMO_USAGE_LOCK:
        DEMO_IP_COUNTS[(day, ip)] = DEMO_IP_COUNTS.get((day, ip), 0) + 1
        DEMO_GLOBAL_COUNTS[day] = DEMO_GLOBAL_COUNTS.get(day, 0) + 1

    effective_dry_run = True if not _allow_real_pr() else req.dry_run
    cfg = AgentConfig(workdir=workdir, dry_run=effective_dry_run)
    initial_state = RunState(run_id=run_id, item_id=req.item_id, status="running")
    record = RunRecord(
        run_id=run_id,
        item_id=req.item_id,
        workdir=workdir,
        config=cfg,
        state=initial_state,
    )
    RUNS[run_id] = record

    def _refund_demo_run() -> None:
        with DEMO_USAGE_LOCK:
            if DEMO_IP_COUNTS.get((day, ip), 0) > 0:
                DEMO_IP_COUNTS[(day, ip)] -= 1
            if DEMO_GLOBAL_COUNTS.get(day, 0) > 0:
                DEMO_GLOBAL_COUNTS[day] -= 1

    def _worker() -> None:
        try:
            final_state = run_agent(req.item_id, config=cfg, on_event=record.publish)
            final_state.run_id = run_id
            record.state = final_state
            if (
                final_state.error_detail
                and final_state.error_detail.get("kind") == "quota_exhausted"
            ):
                _refund_demo_run()
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("api.main").error(
                "Run %s failed unexpectedly: %s", run_id, redact_secrets(str(exc))
            )
            record.state.status = "failed"
            record.state.error = "Agent run failed due to an internal server error."
            record.state.error_detail = {
                "kind": "internal_error",
                "provider": record.state.provider,
                "attempts": 0,
                "retry_after_s": None,
            }
            record.publish(
                {
                    "type": "done",
                    "run_id": run_id,
                    "status": "failed",
                    "error": record.state.error,
                    "error_detail": record.state.error_detail,
                    "diff": "",
                    "tests_passed": False,
                }
            )

    threading.Thread(target=_worker, daemon=True).start()
    return {"run_id": run_id, "item_id": req.item_id, "status": "running"}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    """Get current state and events for a run."""
    record = RUNS.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return {
        **asdict(record.state),
        "events": record.events,
    }


@app.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str) -> StreamingResponse:
    """Stream live agent steps as Server-Sent Events (SSE)."""
    record = RUNS.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    with record.lock:
        backlog = list(record.events)
        record.subscribers.append((loop, queue))

    async def event_generator():
        try:
            for ev in backlog:
                yield f"data: {json.dumps(ev)}\n\n"
                if ev.get("type") == "done":
                    return
            while True:
                ev = await queue.get()
                yield f"data: {json.dumps(ev)}\n\n"
                if ev.get("type") == "done":
                    return
        finally:
            with record.lock:
                record.subscribers = [
                    (lp, q) for (lp, q) in record.subscribers if q is not queue
                ]

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/runs/{run_id}/approve")
def approve(run_id: str) -> dict[str, Any]:
    """Explicitly approve a paused run and open a PR (or dry-run PR)."""
    record = RUNS.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    logger = RunLogger(run_id=run_id, item_id=record.item_id, log_dir=DEFAULT_LOG_DIR)
    try:
        updated = approve_run(record.state, config=record.config, logger=logger)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record.state = updated
    return asdict(updated)


@app.post("/api/runs/{run_id}/reject")
def reject(run_id: str, req: RejectRunRequest) -> dict[str, Any]:
    """Reject a paused run and log the reason without committing."""
    record = RUNS.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    logger = RunLogger(run_id=run_id, item_id=record.item_id, log_dir=DEFAULT_LOG_DIR)
    updated = reject_run(record.state, reason=req.reason, logger=logger)
    record.state = updated
    return asdict(updated)


@app.post("/api/runs/{run_id}/cancel")
def cancel(run_id: str) -> dict[str, Any]:
    """Cancel an in-progress run safely."""
    record = RUNS.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    if record.state.status == "running":
        record.state.status = "cancelled"
        record.publish(
            {
                "type": "done",
                "run_id": run_id,
                "status": "cancelled",
                "diff": "",
                "tests_passed": False,
            }
        )
    return asdict(record.state)
