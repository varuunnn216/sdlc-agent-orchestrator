"""Evaluation runner for 15 SDLC cases (10 stories + 5 bugs; BUG-6 held out)."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from apply_case import apply_case

from agent.llm import get_provider_order, is_provider_configured
from agent.orchestrator import AgentConfig, run_agent
from mcp_server.tools import MCPConfig, run_tests

CASES_FILE = REPO_ROOT / "evals" / "cases.jsonl"
RESULTS_FILE = REPO_ROOT / "evals" / "results" / "latest.md"
PROGRESS_FILE = REPO_ROOT / "evals" / "results" / "progress.json"
EVAL_WORK_ROOT = REPO_ROOT / ".work" / "evals"

PROVIDER_RPM_DELAY_S: dict[str, float] = {
    "groq": 2.1,      # 30 RPM free tier
    "cerebras": 12.1, # 5 RPM free trial tier
    "gemini": 6.1,    # conservative 10 RPM pacing
}


class ProviderPacer:
    """Simple per-provider RPM pacer for eval runs."""

    def __init__(self) -> None:
        self._last_call: dict[str, float] = {}

    def pace(self, provider: str) -> None:
        min_gap = PROVIDER_RPM_DELAY_S.get(provider, 2.0)
        last = self._last_call.get(provider)
        if last is not None:
            elapsed = time.monotonic() - last
            if elapsed < min_gap:
                time.sleep(min_gap - elapsed)
        self._last_call[provider] = time.monotonic()


@dataclass
class CaseOutcome:
    """Measured outcome for a single evaluation case."""

    case_id: str
    item_type: str
    difficulty: str
    passed: bool
    status: str
    tool_calls: int
    total_tokens: int
    duration_s: float
    provider: str = ""
    model: str = ""
    infra_failure: bool = False
    failure_reason: str = ""


def load_cases(cases_path: Path = CASES_FILE) -> list[dict]:
    """Load evaluation cases from JSONL."""
    lines = [
        line.strip()
        for line in cases_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return [json.loads(line) for line in lines]


def _save_progress(outcomes: list[CaseOutcome], progress_path: Path = PROGRESS_FILE) -> None:
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text(
        json.dumps([asdict(o) for o in outcomes], indent=2),
        encoding="utf-8",
    )


def _load_progress(progress_path: Path = PROGRESS_FILE) -> dict[str, CaseOutcome]:
    if not progress_path.exists():
        return {}
    raw = json.loads(progress_path.read_text(encoding="utf-8"))
    out: dict[str, CaseOutcome] = {}
    for row in raw:
        outcome = CaseOutcome(**row)
        if not outcome.infra_failure:
            out[outcome.case_id] = outcome
    return out


def evaluate_case(
    case: dict,
    work_root: Path = EVAL_WORK_ROOT,
    keep_workdir: bool = False,
) -> CaseOutcome:
    """Run one case in an isolated working copy in dry-run mode."""
    case_id = case["id"]
    workdir = work_root / case_id

    try:
        apply_case(case_id, workdir=workdir)
        cfg = AgentConfig(workdir=workdir, dry_run=True)
        state = run_agent(case_id, config=cfg)

        # Independently verify full Vitest suite (target test + no regressions).
        verify = run_tests(config=MCPConfig(workdir=workdir))
        passed = state.status == "awaiting_approval" and bool(verify.get("passed"))

        infra_failure = bool(
            state.error_detail
            and state.error_detail.get("kind")
            in {"quota_exhausted", "provider_config_error", "provider_unavailable"}
        )

        reason = ""
        if not passed:
            if state.error:
                reason = state.error
            elif not verify.get("passed"):
                tail = "\n".join(str(verify.get("output", "")).splitlines()[-5:])
                reason = f"Vitest failed after agent run: {tail}"
            else:
                reason = f"Unexpected status: {state.status}"

        return CaseOutcome(
            case_id=case_id,
            item_type=case["type"],
            difficulty=case["difficulty"],
            passed=passed,
            status=state.status,
            tool_calls=state.tool_calls,
            total_tokens=state.total_tokens,
            duration_s=state.duration_s,
            provider=state.provider,
            model=state.model,
            infra_failure=infra_failure,
            failure_reason=reason,
        )
    finally:
        if not keep_workdir and workdir.exists():
            shutil.rmtree(workdir, ignore_errors=True)


def render_report(outcomes: list[CaseOutcome], model: str = "multi-provider") -> str:
    """Format evaluation outcomes as a Markdown report."""
    total = len(outcomes)
    infra_failures = [o for o in outcomes if o.infra_failure]
    agent_outcomes = [o for o in outcomes if not o.infra_failure]
    passed_count = sum(1 for o in agent_outcomes if o.passed)
    agent_total = len(agent_outcomes)
    success_rate = (passed_count / agent_total * 100.0) if agent_total else 0.0
    avg_tools = (sum(o.tool_calls for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_tokens = (sum(o.total_tokens for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_time = (sum(o.duration_s for o in agent_outcomes) / agent_total) if agent_total else 0.0

    lines = [
        "# Eval Results",
        "",
        f"- **Run timestamp (UTC):** {datetime.now(UTC).isoformat()}",
        f"- **Model:** `{model}`",
        f"- **Cases run:** {total} (dry-run, isolated working copies)",
        f"- **Success rate:** {passed_count}/{agent_total} ({success_rate:.1f}%)",
        f"- **Infra failures (quota/provider):** {len(infra_failures)}",
        f"- **Average tool calls:** {avg_tools:.2f}",
        f"- **Average tokens:** {avg_tokens:.0f}",
        f"- **Average time:** {avg_time:.2f}s",
        "",
        "## Per-Case Breakdown",
        "",
        "| Case | Type | Difficulty | Provider | Model | Result | Status | Tool Calls | Tokens | Time (s) |",
        "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |",
    ]
    for o in outcomes:
        res_label = "INFRA" if o.infra_failure else ("PASS" if o.passed else "FAIL")
        lines.append(
            f"| {o.case_id} | {o.item_type} | {o.difficulty} | {o.provider or '-'} | "
            f"{o.model or '-'} | {res_label} | {o.status} | {o.tool_calls} | "
            f"{o.total_tokens} | {o.duration_s:.2f} |"
        )

    failures = [o for o in agent_outcomes if not o.passed]
    lines.extend(["", "## Agent Failures", ""])
    if not failures:
        lines.append("None — all non-infra cases passed.")
    else:
        for f in failures:
            lines.append(f"- **{f.case_id}** ({f.status}): {f.failure_reason}")

    if infra_failures:
        lines.extend(["", "## Infra Failures", ""])
        for f in infra_failures:
            lines.append(f"- **{f.case_id}** ({f.provider or 'none'}): {f.failure_reason}")

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    load_dotenv()
    os.environ.setdefault("LLM_SHORT_RETRY_MAX_S", "65")
    parser = argparse.ArgumentParser(description="Run SDLC Agent Orchestrator evals")
    parser.add_argument("--case", help="Run only a single case ID (e.g., BUG-6 smoke test)")
    parser.add_argument("--limit", type=int, help="Run only the first N cases")
    parser.add_argument("--keep-workdirs", action="store_true", help="Keep isolated working copies")
    parser.add_argument("--resume", action="store_true", help="Resume from evals/results/progress.json")
    args = parser.parse_args()

    configured = [p for p in get_provider_order() if is_provider_configured(p)]
    if not configured:
        print(
            "Error: Configure at least one provider key (GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY) in .env.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.case:
        cases = [{"id": args.case, "type": "smoke", "difficulty": "held-out"}]
    else:
        cases = load_cases()
        if args.limit:
            cases = cases[: args.limit]

    completed_map = _load_progress() if args.resume else {}
    outcomes: list[CaseOutcome] = []
    pacer = ProviderPacer()

    for case in cases:
        cid = case["id"]
        if cid in completed_map:
            print(f"Skipping {cid} (resumed from progress).", flush=True)
            outcomes.append(completed_map[cid])
            continue

        pacer.pace(configured[0])
        print(f"Running {cid}...", flush=True)
        outcome = evaluate_case(case, keep_workdir=args.keep_workdirs)
        outcomes.append(outcome)
        _save_progress(outcomes)

        label = "INFRA" if outcome.infra_failure else ("PASS" if outcome.passed else "FAIL")
        print(
            f"  -> {label} ({outcome.provider}/{outcome.model}, "
            f"tools={outcome.tool_calls}, tokens={outcome.total_tokens}, time={outcome.duration_s:.2f}s)"
        )
        if outcome.infra_failure:
            print("Stopping early due to infra/quota exhaustion; re-run with --resume to continue.")
            break

    report = render_report(outcomes, model=", ".join(configured))
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(report, encoding="utf-8")
    print(f"\nWrote evaluation report to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
