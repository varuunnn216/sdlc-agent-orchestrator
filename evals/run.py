"""Evaluation runner for 15 SDLC cases (10 stories + 5 bugs; BUG-6 held out)."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from apply_case import apply_case

from agent.llm import get_provider_model, get_provider_order, is_provider_configured
from agent.orchestrator import AgentConfig, run_agent
from mcp_server.tools import MCPConfig, run_tests

CASES_FILE = REPO_ROOT / "evals" / "cases.jsonl"
RESULTS_FILE = REPO_ROOT / "evals" / "results" / "latest.md"
PROGRESS_FILE = REPO_ROOT / "evals" / "results" / "progress.json"
EVAL_WORK_ROOT = REPO_ROOT / ".work" / "evals"

DEFAULT_PROVIDER_LIMITS: dict[str, tuple[int, int]] = {
    "groq": (30, 8_000),
    "cerebras": (5, 30_000),
    "gemini": (5, 250_000),
    "ollama": (60, 1_000_000),
}


class ProviderPacer:
    """Sliding-window RPM and TPM pacer per provider."""

    def __init__(self) -> None:
        self._history: dict[str, list[tuple[float, int]]] = defaultdict(list)

    def _limits(self, provider: str) -> tuple[int, int]:
        default_rpm, default_tpm = DEFAULT_PROVIDER_LIMITS.get(provider, (10, 60_000))
        rpm = int(os.getenv(f"{provider.upper()}_RPM", str(default_rpm)))
        tpm = int(os.getenv(f"{provider.upper()}_TPM", str(default_tpm)))
        return max(1, rpm), max(1000, tpm)

    def pace(self, provider: str, est_tokens: int = 4_000) -> None:
        rpm, tpm = self._limits(provider)
        while True:
            now = time.monotonic()
            recent = [(ts, tok) for ts, tok in self._history[provider] if (now - ts) < 60.0]
            self._history[provider] = recent
            used_tok = sum(tok for _, tok in recent)
            if len(recent) < rpm and (used_tok + est_tokens <= tpm or not recent):
                return
            oldest = recent[0][0]
            sleep_for = max(1.0, 61.0 - (now - oldest))
            time.sleep(sleep_for)

    def record(self, provider: str, tokens: int) -> None:
        if provider:
            self._history[provider].append((time.monotonic(), max(0, tokens)))


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
    active_s: float = 0.0
    wait_s: float = 0.0
    pass_index: int = 1
    thinking_tokens: int = 0
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


def _load_progress(progress_path: Path = PROGRESS_FILE) -> list[CaseOutcome]:
    if not progress_path.exists():
        return []
    raw = json.loads(progress_path.read_text(encoding="utf-8"))
    return [CaseOutcome(**row) for row in raw]


def evaluate_case(
    case: dict,
    work_root: Path = EVAL_WORK_ROOT,
    keep_workdir: bool = False,
    pass_index: int = 1,
) -> CaseOutcome:
    """Run one case in an isolated working copy in dry-run mode."""
    case_id = case["id"]
    workdir = work_root / f"p{pass_index}-{case_id}"

    try:
        apply_case(case_id, workdir=workdir)
        cfg = AgentConfig(workdir=workdir, dry_run=True)
        state = run_agent(case_id, config=cfg)

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
            thinking_tokens=state.thinking_tokens,
            duration_s=state.duration_s,
            active_s=state.active_s,
            wait_s=state.wait_s,
            pass_index=pass_index,
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
    infra_failures = [o for o in outcomes if o.infra_failure]
    agent_outcomes = [o for o in outcomes if not o.infra_failure]
    passed_count = sum(1 for o in agent_outcomes if o.passed)
    agent_total = len(agent_outcomes)
    overall_rate = (passed_count / agent_total * 100.0) if agent_total else 0.0
    avg_tools = (sum(o.tool_calls for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_tokens = (sum(o.total_tokens for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_thinking = (
        (sum(o.thinking_tokens for o in agent_outcomes) / agent_total) if agent_total else 0.0
    )
    avg_time = (sum(o.duration_s for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_active = (sum(o.active_s for o in agent_outcomes) / agent_total) if agent_total else 0.0
    avg_wait = (sum(o.wait_s for o in agent_outcomes) / agent_total) if agent_total else 0.0

    # Per-pass stats
    passes_seen = sorted({o.pass_index for o in outcomes})
    pass_rates: list[float] = []
    pass_lines: list[str] = []
    for p in passes_seen:
        p_agent = [o for o in agent_outcomes if o.pass_index == p]
        p_infra = [o for o in infra_failures if o.pass_index == p]
        p_pass = sum(1 for o in p_agent if o.passed)
        rate = (p_pass / len(p_agent) * 100.0) if p_agent else 0.0
        if p_agent:
            pass_rates.append(rate)
        pass_lines.append(
            f"- **Pass {p}:** {p_pass}/{len(p_agent)} ({rate:.1f}%), infra skipped/failed: {len(p_infra)}"
        )

    mean_rate = (sum(pass_rates) / len(pass_rates)) if pass_rates else 0.0
    min_rate = min(pass_rates) if pass_rates else 0.0
    max_rate = max(pass_rates) if pass_rates else 0.0

    lines = [
        "# Eval Results",
        "",
        f"- **Run timestamp (UTC):** {datetime.now(UTC).isoformat()}",
        f"- **Model:** `{model}`",
        f"- **Cases run:** {len(outcomes)} across {len(passes_seen)} pass(es) (dry-run, isolated working copies)",
        f"- **Success rate:** {passed_count}/{agent_total} ({overall_rate:.1f}%)",
        f"- **Pass rate mean (min–max):** {mean_rate:.1f}% ({min_rate:.1f}%–{max_rate:.1f}%)",
        f"- **Infra failures (quota/provider):** {len(infra_failures)}",
        f"- **Average tool calls:** {avg_tools:.2f}",
        f"- **Average tokens:** {avg_tokens:.0f} (avg thinking tokens: {avg_thinking:.0f})",
        f"- **Average time:** {avg_time:.2f}s (active: {avg_active:.2f}s, rate-limit wait: {avg_wait:.2f}s)",
        "",
        "## Per-Pass Summary",
        "",
        *pass_lines,
        "",
        "## By Difficulty & Type",
        "",
        "| Group | Passed | Total | Rate |",
        "| --- | ---: | ---: | ---: |",
    ]

    for group_key, group_vals in (
        ("easy", [o for o in agent_outcomes if o.difficulty == "easy"]),
        ("medium", [o for o in agent_outcomes if o.difficulty == "medium"]),
        ("hard", [o for o in agent_outcomes if o.difficulty == "hard"]),
        ("story", [o for o in agent_outcomes if o.item_type == "story"]),
        ("bug", [o for o in agent_outcomes if o.item_type == "bug"]),
    ):
        g_pass = sum(1 for o in group_vals if o.passed)
        g_tot = len(group_vals)
        g_rate = (g_pass / g_tot * 100.0) if g_tot else 0.0
        lines.append(f"| {group_key} | {g_pass} | {g_tot} | {g_rate:.1f}% |")

    # Per-case pass/fail matrix
    case_ids = list(dict.fromkeys(o.case_id for o in outcomes))
    pass_headers = " | ".join(f"Pass {p}" for p in passes_seen)
    pass_sep = " | ".join("---" for _ in passes_seen)
    lines.extend(
        [
            "",
            "## Per-Case Pass/Fail Matrix",
            "",
            f"| Case | Type | Difficulty | {pass_headers} |",
            f"| --- | --- | --- | {pass_sep} |",
        ]
    )
    by_pair = {(o.pass_index, o.case_id): o for o in outcomes}
    for cid in case_ids:
        sample = next(o for o in outcomes if o.case_id == cid)
        cells = []
        for p in passes_seen:
            item = by_pair.get((p, cid))
            if item is None:
                cells.append("-")
            elif item.infra_failure:
                cells.append("INFRA")
            else:
                cells.append("PASS" if item.passed else "FAIL")
        lines.append(
            f"| {cid} | {sample.item_type} | {sample.difficulty} | {' | '.join(cells)} |"
        )

    lines.extend(
        [
            "",
            "## Per-Case Breakdown",
            "",
            "| Pass | Case | Type | Difficulty | Provider | Model | Result | Status | Tool Calls | Tokens | Thinking | Active (s) | Wait (s) | Total (s) |",
            "| ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for o in outcomes:
        res_label = "INFRA" if o.infra_failure else ("PASS" if o.passed else "FAIL")
        lines.append(
            f"| {o.pass_index} | {o.case_id} | {o.item_type} | {o.difficulty} | {o.provider or '-'} | "
            f"{o.model or '-'} | {res_label} | {o.status} | {o.tool_calls} | "
            f"{o.total_tokens} | {o.thinking_tokens} | {o.active_s:.2f} | {o.wait_s:.2f} | {o.duration_s:.2f} |"
        )

    failures = [o for o in agent_outcomes if not o.passed]
    lines.extend(["", "## Agent Failures", ""])
    if not failures:
        lines.append("None — all non-infra cases passed.")
    else:
        for f in failures:
            lines.append(f"- **[agent] {f.case_id}** (pass {f.pass_index}, {f.status}): {f.failure_reason}")

    if infra_failures:
        lines.extend(["", "## Infra Failures", ""])
        for f in infra_failures:
            lines.append(
                f"- **[infra] {f.case_id}** (pass {f.pass_index}, {f.provider or 'none'}): {f.failure_reason}"
            )

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run SDLC Agent Orchestrator evals")
    parser.add_argument("--case", help="Run only a single case ID (e.g., BUG-6 smoke test)")
    parser.add_argument("--limit", type=int, help="Run only the first N cases")
    parser.add_argument("--passes", type=int, default=1, help="Number of passes per case")
    parser.add_argument("--budget", type=int, help="Max cases to run in this invocation (implies --resume)")
    parser.add_argument("--keep-workdirs", action="store_true", help="Keep isolated working copies")
    parser.add_argument("--resume", action="store_true", help="Resume from evals/results/progress.json")
    args = parser.parse_args()

    configured = [p for p in get_provider_order() if is_provider_configured(p)]
    if not configured:
        print(
            "Error: Configure at least one provider key (GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, or ollama) in .env.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.case:
        cases = [{"id": args.case, "type": "smoke", "difficulty": "held-out"}]
    else:
        cases = load_cases()
        if args.limit:
            cases = cases[: args.limit]

    use_resume = args.resume or (args.budget is not None)
    existing = _load_progress() if use_resume else []
    by_key: dict[tuple[int, str], CaseOutcome] = {
        (o.pass_index, o.case_id): o for o in existing
    }
    pacer = ProviderPacer()
    quota_stopped = False
    ran_this_session = 0

    for pass_idx in range(1, args.passes + 1):
        for case in cases:
            if args.budget is not None and ran_this_session >= args.budget:
                break
            cid = case["id"]
            prev = by_key.get((pass_idx, cid))
            if prev is not None and not prev.infra_failure:
                print(f"Skipping pass {pass_idx} {cid} (already completed).", flush=True)
                continue

            pacer.pace(configured[0])
            print(f"Running pass {pass_idx}/{args.passes} {cid}...", flush=True)
            outcome = evaluate_case(
                case,
                keep_workdir=args.keep_workdirs,
                pass_index=pass_idx,
            )
            ran_this_session += 1
            pacer.record(outcome.provider or configured[0], outcome.total_tokens)
            by_key[(pass_idx, cid)] = outcome
            _save_progress(list(by_key.values()))

            label = "INFRA" if outcome.infra_failure else ("PASS" if outcome.passed else "FAIL")
            print(
                f"  -> {label} ({outcome.provider}/{outcome.model}, "
                f"tools={outcome.tool_calls}, tokens={outcome.total_tokens}, "
                f"thinking={outcome.thinking_tokens}, active={outcome.active_s:.2f}s, wait={outcome.wait_s:.2f}s)"
            )
            if outcome.infra_failure:
                print("Stopping early due to infra/quota exhaustion; re-run with --resume to continue.")
                quota_stopped = True
                break
        if quota_stopped or (args.budget is not None and ran_this_session >= args.budget):
            break

    outcomes = list(by_key.values())
    completed_non_infra = sum(1 for o in outcomes if not o.infra_failure)
    completed_passes = sum(
        1
        for p in range(1, args.passes + 1)
        if all(
            (p, c["id"]) in by_key and not by_key[(p, c["id"])].infra_failure
            for c in cases
        )
    )
    print(
        f"\nProgress: {completed_non_infra}/{len(cases) * args.passes} cases completed; "
        f"{completed_passes}/{args.passes} full passes completed."
    )
    model_summary = ", ".join(f"{p}:{get_provider_model(p)}" for p in configured)
    report = render_report(outcomes, model=model_summary)
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(report, encoding="utf-8")
    print(f"\nWrote evaluation report to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
