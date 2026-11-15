"""Unit tests for the evaluation runner (cases loading, isolated execution, reporting)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from agent.orchestrator import RunState
from evals.run import CaseOutcome, evaluate_case, load_cases, render_report


def test_cases_jsonl_has_15_cases_with_bug6_held_out() -> None:
    cases = load_cases()
    assert len(cases) == 15
    ids = {c["id"] for c in cases}
    assert "BUG-6" not in ids
    assert sum(1 for c in cases if c["type"] == "story") == 10
    assert sum(1 for c in cases if c["type"] == "bug") == 5


def test_evaluate_case_isolated_workdir_and_report(tmp_path: Path) -> None:
    case = {"id": "BUG-1", "type": "bug", "difficulty": "easy"}
    fake_state = RunState(
        run_id="bug-1-abc",
        item_id="BUG-1",
        status="awaiting_approval",
        tests_passed=True,
        tool_calls=4,
        total_tokens=1500,
        duration_s=2.5,
    )

    with (
        patch("evals.run.run_agent", return_value=fake_state),
        patch("evals.run.run_tests", return_value={"passed": True, "returncode": 0, "output": "ok"}),
    ):
        outcome = evaluate_case(case, work_root=tmp_path, keep_workdir=False)

    assert outcome.passed is True
    assert outcome.tool_calls == 4
    assert not (tmp_path / "BUG-1").exists()  # cleaned up after eval

    fail_outcome = CaseOutcome(
        case_id="STORY-10",
        item_type="story",
        difficulty="hard",
        passed=False,
        status="failed",
        tool_calls=9,
        total_tokens=4200,
        duration_s=6.0,
        failure_reason="Tests failed after 2 retries.",
    )
    report = render_report([outcome, fail_outcome], model="claude-sonnet-4-5-20250929")
    assert "1/2 (50.0%)" in report
    assert "STORY-10" in report
    assert "Tests failed after 2 retries." in report
