"""Anthropic SDK tool-use agent loop: plan -> implement -> verify -> approval gate."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

from agent.logger import DEFAULT_LOG_DIR, RunLogger
from mcp_server.tools import (
    DEFAULT_WORKDIR,
    MCPConfig,
    get_work_item,
    open_pr,
    read_file,
    run_tests,
    write_file,
)

load_dotenv()

ANTHROPIC_TOOLS = [
    {
        "name": "get_work_item",
        "description": "Fetch the full ticket details for a work item ID.",
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "string", "description": "Work item ID"}},
            "required": ["id"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a file inside the sample-app working copy.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Relative file path"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write full updated content to a file inside the sample-app working copy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative file path"},
                "content": {"type": "string", "description": "Complete file contents"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_tests",
        "description": "Run the Vitest suite in the sample-app working copy.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


@dataclass
class AgentConfig:
    """Configuration and safety budgets for an agent run."""

    provider: str = ""  # "gemini" | "anthropic" (auto-detected from env if empty)
    model: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
    )
    gemini_model: str = field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    )
    max_tool_calls: int = 15
    max_tokens_per_run: int = 50_000
    max_test_retries: int = 2
    workdir: Path = DEFAULT_WORKDIR
    log_dir: Path = DEFAULT_LOG_DIR
    dry_run: bool = False


@dataclass
class RunState:
    """Result and approval state of a single agent run."""

    run_id: str
    item_id: str
    status: str  # awaiting_approval | approved | rejected | failed | budget_exceeded
    plan: str = ""
    diff: str = ""
    tests_passed: bool = False
    tool_calls: int = 0
    total_tokens: int = 0
    duration_s: float = 0.0
    pr_result: dict[str, Any] | None = None
    reject_reason: str | None = None
    error: str | None = None


def _list_src_files(workdir: Path) -> list[str]:
    src_dir = workdir / "src"
    if not src_dir.exists():
        return []
    return sorted(
        str(p.relative_to(workdir))
        for p in src_dir.rglob("*")
        if p.is_file()
    )


def _get_git_diff(workdir: Path) -> str:
    subprocess.run(["git", "add", "-N", "."], cwd=workdir, check=False)
    res = subprocess.run(
        ["git", "diff"],
        cwd=workdir,
        capture_output=True,
        text=True,
        check=False,
    )
    return res.stdout


def _execute_tool(name: str, tool_input: dict[str, Any], mcp_cfg: MCPConfig) -> Any:
    if name == "get_work_item":
        return get_work_item(tool_input["id"], config=mcp_cfg)
    if name == "read_file":
        return read_file(tool_input["path"], config=mcp_cfg)
    if name == "write_file":
        return write_file(tool_input["path"], tool_input["content"], config=mcp_cfg)
    if name == "run_tests":
        return run_tests(config=mcp_cfg)
    raise ValueError(f"Unknown tool: {name}")


def _extract_text(content_blocks: list[Any]) -> str:
    parts = [
        getattr(block, "text", "")
        for block in content_blocks
        if getattr(block, "type", None) == "text"
    ]
    return "\n".join(p for p in parts if p).strip()


def _resolve_provider(cfg: AgentConfig, client: Any | None) -> str:
    if cfg.provider:
        return cfg.provider.lower()
    if client is not None:
        return "anthropic"
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if gemini_key and gemini_key != "your-gemini-api-key-here":
        return "gemini"
    if anthropic_key and anthropic_key != "your-anthropic-api-key-here":
        return "anthropic"
    raise ValueError("Set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env to run the agent.")


def _run_gemini(
    item: dict[str, Any],
    src_files: list[str],
    cfg: AgentConfig,
    mcp_cfg: MCPConfig,
    logger: RunLogger,
    state: RunState,
    on_event: Callable[[dict[str, Any]], None] | None,
) -> RunState:
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your-gemini-api-key-here":
        raise ValueError("GEMINI_API_KEY is required when using provider='gemini'.")

    client = genai.Client(api_key=api_key)
    total_tokens = 0
    tool_calls = 0
    test_failures = 0

    # Phase 1: Plan first
    t0 = time.monotonic()
    plan_prompt = (
        f"Ticket {item['id']} ({item['type']} - {item['difficulty']}):\n"
        f"{json.dumps(item, indent=2)}\n\n"
        "Working copy files:\n" + "\n".join(f"- {f}" for f in src_files) + "\n\n"
        "Write a concise 3-5 bullet implementation plan. Do not call tools yet."
    )
    plan_resp = client.models.generate_content(
        model=cfg.gemini_model,
        contents=plan_prompt,
        config=types.GenerateContentConfig(
            system_instruction="You are a senior React/TypeScript engineer. Produce a brief, actionable plan.",
            max_output_tokens=600,
        ),
    )
    usage = getattr(plan_resp, "usage_metadata", None)
    t_in = getattr(usage, "prompt_token_count", 0) or 0
    t_out = getattr(usage, "candidates_token_count", 0) or 0
    total_tokens += t_in + t_out
    state.plan = (plan_resp.text or "").strip()
    logger.record(
        phase="plan",
        tool="plan",
        args={"item_id": item["id"]},
        result=state.plan,
        tokens_in=t_in,
        tokens_out=t_out,
        duration_ms=int((time.monotonic() - t0) * 1000),
    )
    if on_event is not None:
        on_event({"type": "plan", "run_id": state.run_id, "plan": state.plan})

    # Phase 2 & 3: Implement & Verify
    declarations = [
        types.FunctionDeclaration(
            name=t["name"],
            description=t["description"],
            parameters_json_schema=t["input_schema"],
        )
        for t in ANTHROPIC_TOOLS
    ]
    tool_config = types.GenerateContentConfig(
        system_instruction=(
            "You are an autonomous SDLC agent editing a React + TypeScript + Vite app.\n"
            "Rules:\n"
            "1. Only read/write files inside the working copy using the provided tools.\n"
            "2. Implement the fix or feature cleanly without breaking existing tests.\n"
            "3. Run `run_tests` after editing to verify all tests pass.\n"
            "4. Stop as soon as `run_tests` passes."
        ),
        tools=[types.Tool(function_declarations=declarations)],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        max_output_tokens=4096,
    )
    contents: list[Any] = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=(
                        f"Implement the following plan for {item['id']}:\n{state.plan}\n\n"
                        f"Ticket details:\n{json.dumps(item, indent=2)}\n\n"
                        "Available files:\n" + "\n".join(f"- {f}" for f in src_files)
                    )
                )
            ],
        )
    ]

    while True:
        if total_tokens >= cfg.max_tokens_per_run:
            state.status = "budget_exceeded"
            state.error = f"Token budget exceeded ({total_tokens} >= {cfg.max_tokens_per_run})"
            break
        if tool_calls >= cfg.max_tool_calls:
            state.status = "budget_exceeded"
            state.error = f"Tool call limit reached ({tool_calls} >= {cfg.max_tool_calls})"
            break

        resp = client.models.generate_content(
            model=cfg.gemini_model,
            contents=contents,
            config=tool_config,
        )
        usage = getattr(resp, "usage_metadata", None)
        t_in = getattr(usage, "prompt_token_count", 0) or 0
        t_out = getattr(usage, "candidates_token_count", 0) or 0
        total_tokens += t_in + t_out

        candidate_content = resp.candidates[0].content if resp.candidates else None
        parts = candidate_content.parts if candidate_content else []
        fn_calls = [p.function_call for p in parts if getattr(p, "function_call", None)]
        if not fn_calls:
            break

        contents.append(candidate_content)
        response_parts: list[Any] = []
        for idx, fc in enumerate(fn_calls):
            if tool_calls >= cfg.max_tool_calls:
                state.status = "budget_exceeded"
                state.error = f"Tool call limit reached ({cfg.max_tool_calls})"
                break

            tool_calls += 1
            t_tool = time.monotonic()
            args = dict(fc.args or {})
            try:
                output = _execute_tool(fc.name, args, mcp_cfg)
            except (ValueError, FileNotFoundError, subprocess.SubprocessError, OSError) as exc:
                output = {"error": str(exc)}

            phase = "verify" if fc.name == "run_tests" else "implement"
            if fc.name == "run_tests" and isinstance(output, dict):
                state.tests_passed = bool(output.get("passed"))
                if not state.tests_passed:
                    test_failures += 1

            logger.record(
                phase=phase,
                tool=fc.name,
                args=args,
                result=output,
                tokens_in=t_in if idx == 0 else 0,
                tokens_out=t_out if idx == 0 else 0,
                duration_ms=int((time.monotonic() - t_tool) * 1000),
            )
            response_parts.append(
                types.Part.from_function_response(
                    name=fc.name,
                    response={"result": output},
                )
            )

        if state.status == "budget_exceeded":
            break

        contents.append(types.Content(role="user", parts=response_parts))
        if test_failures > cfg.max_test_retries:
            state.status = "failed"
            state.error = f"Tests failed after {cfg.max_test_retries} retries."
            break

    state.tool_calls = tool_calls
    state.total_tokens = total_tokens
    return state


def run_agent(
    item_id: str,
    config: AgentConfig | None = None,
    client: Any | None = None,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> RunState:
    """Execute plan -> implement -> verify and pause at the approval gate."""
    cfg = config or AgentConfig()
    mcp_cfg = MCPConfig(workdir=cfg.workdir, dry_run=cfg.dry_run)
    run_id = f"{item_id.lower()}-{uuid.uuid4().hex[:8]}"
    logger = RunLogger(run_id=run_id, item_id=item_id, log_dir=cfg.log_dir, on_event=on_event)
    start_time = time.monotonic()

    provider = _resolve_provider(cfg, client)
    item = get_work_item(item_id, config=mcp_cfg)
    src_files = _list_src_files(cfg.workdir)
    state = RunState(run_id=run_id, item_id=item_id, status="running")

    if provider == "gemini":
        state = _run_gemini(item, src_files, cfg, mcp_cfg, logger, state, on_event)
        state.diff = _get_git_diff(cfg.workdir)
        state.duration_s = round(time.monotonic() - start_time, 2)
        if state.status not in ("budget_exceeded", "failed"):
            if state.tests_passed:
                state.status = "awaiting_approval"
            else:
                state.status = "failed"
                state.error = state.error or "Tests did not pass."
        logger.set_metadata(
            status=state.status,
            tool_calls=state.tool_calls,
            total_tokens=state.total_tokens,
            duration_s=state.duration_s,
            tests_passed=state.tests_passed,
            error=state.error,
        )
        if on_event is not None:
            on_event(
                {
                    "type": "done",
                    "run_id": run_id,
                    "status": state.status,
                    "diff": state.diff,
                    "tests_passed": state.tests_passed,
                    "error": state.error,
                }
            )
        return state

    if client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key or api_key == "your-anthropic-api-key-here":
            raise ValueError("ANTHROPIC_API_KEY is required to run the agent.")
        client = anthropic.Anthropic(api_key=api_key)

    total_tokens = 0
    tool_calls = 0
    test_failures = 0

    # Phase 1: Plan first
    t0 = time.monotonic()
    plan_prompt = (
        f"Ticket {item['id']} ({item['type']} - {item['difficulty']}):\n"
        f"{json.dumps(item, indent=2)}\n\n"
        f"Working copy files:\n" + "\n".join(f"- {f}" for f in src_files) + "\n\n"
        "Write a concise 3-5 bullet implementation plan. Do not call tools yet."
    )
    plan_resp = client.messages.create(
        model=cfg.model,
        max_tokens=600,
        system="You are a senior React/TypeScript engineer. Produce a brief, actionable plan.",
        messages=[{"role": "user", "content": plan_prompt}],
    )
    t_in = getattr(plan_resp.usage, "input_tokens", 0)
    t_out = getattr(plan_resp.usage, "output_tokens", 0)
    total_tokens += t_in + t_out
    state.plan = _extract_text(plan_resp.content)
    logger.record(
        phase="plan",
        tool="plan",
        args={"item_id": item_id},
        result=state.plan,
        tokens_in=t_in,
        tokens_out=t_out,
        duration_ms=int((time.monotonic() - t0) * 1000),
    )

    if on_event is not None:
        on_event({"type": "plan", "run_id": run_id, "plan": state.plan})

    # Phase 2 & 3: Implement via tools + Verify with run_tests (max 2 retries on failure)
    system_prompt = (
        "You are an autonomous SDLC agent editing a React + TypeScript + Vite app.\n"
        "Rules:\n"
        "1. Only read/write files inside the working copy using the provided tools.\n"
        "2. Implement the fix or feature cleanly without breaking existing tests.\n"
        "3. Run `run_tests` after editing to verify all tests pass.\n"
        "4. Stop as soon as `run_tests` passes."
    )
    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": (
                f"Implement the following plan for {item['id']}:\n{state.plan}\n\n"
                f"Ticket details:\n{json.dumps(item, indent=2)}\n\n"
                f"Available files:\n" + "\n".join(f"- {f}" for f in src_files)
            ),
        }
    ]

    while True:
        if total_tokens >= cfg.max_tokens_per_run:
            state.status = "budget_exceeded"
            state.error = f"Token budget exceeded ({total_tokens} >= {cfg.max_tokens_per_run})"
            break
        if tool_calls >= cfg.max_tool_calls:
            state.status = "budget_exceeded"
            state.error = f"Tool call limit reached ({tool_calls} >= {cfg.max_tool_calls})"
            break

        t_turn = time.monotonic()
        resp = client.messages.create(
            model=cfg.model,
            max_tokens=2048,
            system=system_prompt,
            tools=ANTHROPIC_TOOLS,
            messages=messages,
        )
        t_in = getattr(resp.usage, "input_tokens", 0)
        t_out = getattr(resp.usage, "output_tokens", 0)
        total_tokens += t_in + t_out

        tool_uses = [b for b in resp.content if getattr(b, "type", None) == "tool_use"]
        if not tool_uses:
            # Agent finished its turn without requesting more tools.
            break

        messages.append({"role": "assistant", "content": resp.content})
        tool_results: list[dict[str, Any]] = []

        for block in tool_uses:
            if tool_calls >= cfg.max_tool_calls:
                state.status = "budget_exceeded"
                state.error = f"Tool call limit reached ({cfg.max_tool_calls})"
                break

            tool_calls += 1
            t_tool = time.monotonic()
            try:
                output = _execute_tool(block.name, block.input, mcp_cfg)
                is_error = False
            except (ValueError, FileNotFoundError, subprocess.SubprocessError, OSError) as exc:
                output = {"error": str(exc)}
                is_error = True

            phase = "verify" if block.name == "run_tests" else "implement"
            if block.name == "run_tests" and isinstance(output, dict):
                state.tests_passed = bool(output.get("passed"))
                if not state.tests_passed:
                    test_failures += 1

            logger.record(
                phase=phase,
                tool=block.name,
                args=block.input,
                result=output,
                tokens_in=t_in if block is tool_uses[0] else 0,
                tokens_out=t_out if block is tool_uses[0] else 0,
                duration_ms=int((time.monotonic() - t_tool) * 1000),
            )

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(output) if not isinstance(output, str) else output,
                    "is_error": is_error,
                }
            )

        if state.status == "budget_exceeded":
            break

        messages.append({"role": "user", "content": tool_results})

        if test_failures > cfg.max_test_retries:
            state.status = "failed"
            state.error = f"Tests failed after {cfg.max_test_retries} retries."
            break

        if getattr(resp, "stop_reason", None) == "end_turn":
            break
        _ = t_turn

    # Phase 4: Approval gate (never commit without explicit approve_run call)
    state.diff = _get_git_diff(cfg.workdir)
    state.tool_calls = tool_calls
    state.total_tokens = total_tokens
    state.duration_s = round(time.monotonic() - start_time, 2)

    if state.status not in ("budget_exceeded", "failed"):
        if state.tests_passed:
            state.status = "awaiting_approval"
        else:
            state.status = "failed"
            state.error = state.error or "Tests did not pass."

    logger.set_metadata(
        status=state.status,
        tool_calls=state.tool_calls,
        total_tokens=state.total_tokens,
        duration_s=state.duration_s,
        tests_passed=state.tests_passed,
        error=state.error,
    )
    if on_event is not None:
        on_event(
            {
                "type": "done",
                "run_id": run_id,
                "status": state.status,
                "diff": state.diff,
                "tests_passed": state.tests_passed,
            }
        )
    return state


def approve_run(
    state: RunState,
    config: AgentConfig | None = None,
    logger: RunLogger | None = None,
) -> RunState:
    """Explicitly approve a run and open a PR (or dry-run PR)."""
    if state.status != "awaiting_approval":
        raise ValueError(f"Cannot approve run in status '{state.status}'.")

    cfg = config or AgentConfig()
    mcp_cfg = MCPConfig(workdir=cfg.workdir, dry_run=cfg.dry_run)
    branch = f"agent/{state.item_id.lower()}-{state.run_id[-6:]}"
    title = f"feat/fix({state.item_id}): automated resolution"
    body = f"Automated resolution for `{state.item_id}`.\n\n### Plan\n{state.plan}"

    pr = open_pr(branch=branch, title=title, body=body, dry_run=cfg.dry_run, config=mcp_cfg)
    state.status = "approved"
    state.pr_result = pr

    if logger is not None:
        logger.record(
            phase="approval",
            tool="open_pr",
            args={"branch": branch, "title": title, "dry_run": cfg.dry_run},
            result=pr,
        )
        logger.set_metadata(status="approved", pr_result=pr)
    return state


def reject_run(
    state: RunState,
    reason: str,
    logger: RunLogger | None = None,
) -> RunState:
    """Reject a run and log the reason without committing anything."""
    state.status = "rejected"
    state.reject_reason = reason
    if logger is not None:
        logger.record(
            phase="approval",
            tool="reject",
            args={"reason": reason},
            result={"status": "rejected"},
        )
        logger.set_metadata(status="rejected", reject_reason=reason)
    return state


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SDLC Agent on a work item")
    parser.add_argument("item_id", help="Work item ID (e.g., BUG-1 or STORY-1)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate PR creation")
    args = parser.parse_args()

    cfg = AgentConfig(dry_run=args.dry_run)
    result = run_agent(args.item_id, config=cfg)
    print(f"Run {result.run_id} finished with status={result.status}")
    print(f"Tools={result.tool_calls}, Tokens={result.total_tokens}, Time={result.duration_s}s")
    if result.diff:
        print("\n--- DIFF ---\n" + result.diff)


if __name__ == "__main__":
    main()
