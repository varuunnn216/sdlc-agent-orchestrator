"""JSON step logger with optional live event callback for SSE streaming."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOG_DIR = REPO_ROOT / "logs"


@dataclass
class StepLog:
    """Single logged step in an agent run."""

    step_index: int
    phase: str
    tool: str
    args: dict[str, Any]
    result: Any
    tokens_in: int = 0
    tokens_out: int = 0
    duration_ms: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class RunLogger:
    """Collects steps for a run and persists them as JSON."""

    def __init__(
        self,
        run_id: str,
        item_id: str,
        log_dir: Path = DEFAULT_LOG_DIR,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.run_id = run_id
        self.item_id = item_id
        self.log_dir = log_dir
        self.on_event = on_event
        self.steps: list[StepLog] = []
        self.metadata: dict[str, Any] = {}

    def record(
        self,
        phase: str,
        tool: str,
        args: dict[str, Any],
        result: Any,
        tokens_in: int = 0,
        tokens_out: int = 0,
        duration_ms: int = 0,
    ) -> StepLog:
        """Append a step, emit live event if configured, and flush JSON log."""
        step = StepLog(
            step_index=len(self.steps) + 1,
            phase=phase,
            tool=tool,
            args=args,
            result=result,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            duration_ms=duration_ms,
        )
        self.steps.append(step)
        if self.on_event is not None:
            self.on_event({"type": "step", "run_id": self.run_id, "step": asdict(step)})
        self.save()
        return step

    def set_metadata(self, **kwargs: Any) -> None:
        """Update run-level metadata and persist."""
        self.metadata.update(kwargs)
        self.save()

    def save(self) -> Path:
        """Write the run log as JSON to `logs/<run_id>.json`."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        path = self.log_dir / f"{self.run_id}.json"
        payload = {
            "run_id": self.run_id,
            "item_id": self.item_id,
            "metadata": self.metadata,
            "steps": [asdict(s) for s in self.steps],
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path
