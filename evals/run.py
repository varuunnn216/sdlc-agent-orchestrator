"""Evaluation runner for 15 SDLC cases (10 stories + 5 bugs; BUG-6 held out)."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from apply_case import apply_case

from agent.orchestrator import AgentConfig, run_agent
from mcp_server.tools import MCPConfig, run_tests

CASES_FILE = REPO_ROOT / "evals" / "cases.jsonl"
RESULTS_FILE = REPO_ROOT / "evals" / "results" / "latest.md"
EVAL_WORK_ROOT = REPO_ROOT / ".work" / "evals"


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
    failure_reason: str = ""


def load_cases(cases_path: Path = CASES_FILE) -> list[dict]:
    """Load evaluation cases from JSONL."""
    lines = [
        line.strip()
        for line in cases_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return [json.loads(line) for line in lines]


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
            failure_reason=reason,
        )
    finally:
        if not keep_workdir and workdir.exists():
            shutil.rmtree(workdir, ignore_errors=True)


def render_report(outcomes: list[CaseOutcome], model: str) -> str:
    """Format evaluation outcomes as a Markdown report."""
    total = len(outcomes)
    passed_count = sum(1 for o in outcomes if o.passed)
    success_rate = (passed_count / total * 100.0) if total else 0.0
    avg_tools = (sum(o.tool_calls for o in outcomes) / total) if total else 0.0
    avg_tokens = (sum(o.total_tokens for o in outcomes) / total) if total else 0.0
    avg_time = (sum(o.duration_s for o in outcomes) / total) if total else 0.0

    lines = [
        "# Eval Results",
        "",
        f"- **Run timestamp (UTC):** {datetime.now(UTC).isoformat()}",
        f"- **Model:** `{model}`",
        f"- **Cases run:** {total} (dry-run, isolated working copies)",
        f"- **Success rate:** {passed_count}/{total} ({success_rate:.1f}%)",
        f"- **Average tool calls:** {avg_tools:.2f}",
        f"- **Average tokens:** {avg_tokens:.0f}",
        f"- **Average time:** {avg_time:.2f}s",
        "",
        "## Per-Case Breakdown",
        "",
        "| Case | Type | Difficulty | Result | Status | Tool Calls | Tokens | Time (s) |",
        "| --- | --- | --- | --- | --- | ---: | ---: | ---: |",
    ]
    for o in outcomes:
        res_label = "PASS" if o.passed else "FAIL"
        lines.append(
            f"| {o.case_id} | {o.item_type} | {o.difficulty} | {res_label} | "
            f"{o.status} | {o.tool_calls} | {o.total_tokens} | {o.duration_s:.2f} |"
        )

    failures = [o for o in outcomes if not o.passed]
    lines.extend(["", "## Failures", ""])
    if not failures:
        lines.append("None — all cases passed.")
    else:
        for f in failures:
            lines.append(f"- **{f.case_id}** ({f.status}): {f.failure_reason}")

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run SDLC Agent Orchestrator evals")
    parser.add_argument("--case", help="Run only a single case ID (e.g., BUG-6 smoke test)")
    parser.add_argument("--limit", type=int, help="Run only the first N cases")
    parser.add_argument("--keep-workdirs", action="store_true", help="Keep isolated working copies")
    args = parser.parse_args()

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    has_gemini = bool(gemini_key and gemini_key != "your-gemini-api-key-here")
    has_anthropic = bool(anthropic_key and anthropic_key != "your-anthropic-api-key-here")
    if not has_gemini and not has_anthropic:
        print(
            "Error: Set a valid GEMINI_API_KEY or ANTHROPIC_API_KEY in .env before running evals.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.case:
        cases = [{"id": args.case, "type": "smoke", "difficulty": "held-out"}]
    else:
        cases = load_cases()
        if args.limit:
            cases = cases[: args.limit]

    outcomes: list[CaseOutcome] = []
    for case in cases:
        print(f"Running {case['id']}...", flush=True)
        outcome = evaluate_case(case, keep_workdir=args.keep_workdirs)
        outcomes.append(outcome)
        print(
            f"  -> {'PASS' if outcome.passed else 'FAIL'} "
            f"(tools={outcome.tool_calls}, tokens={outcome.total_tokens}, time={outcome.duration_s:.2f}s)"
        )

    model = AgentConfig().model
    report = render_report(outcomes, model=model)
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(report, encoding="utf-8")
    print(f"\nWrote evaluation report to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
