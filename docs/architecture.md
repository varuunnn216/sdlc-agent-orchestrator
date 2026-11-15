# Architecture — SDLC Agent Orchestrator

## System Overview

The **SDLC Agent Orchestrator** separates ticket orchestration, LLM reasoning, sandboxed file/test execution, and human approval into distinct layers:

```mermaid
flowchart TD
    UI["React UI (/ui)"] -->|"REST + SSE (/api/runs/{id}/stream)"| API["FastAPI Backend (/api)"]
    API -->|"Apply case to isolated workdir"| Scripts["scripts/apply_case.py"]
    Scripts -->|"Copy + patch/test"| Workdir["Isolated Working Copy (.work/runs/...)"]
    API -->|"Start background run"| Agent["Agent Loop (/agent)"]
    Agent -->|"1. Plan -> 2. Implement -> 3. Verify"| Anthropic["Anthropic SDK (tool-use)"]
    Agent -->|"Tool calls (max 15)"| MCP["MCP Tools (/mcp_server)"]
    MCP -->|"Scoped read/write (no traversal)"| Workdir
    MCP -->|"run_tests()"| Vitest["Vitest Suite"]
    Agent -->|"JSON step logs"| Logs["logs/<run_id>.json"]
    Agent -->|"4. Pause + expose git diff"| Gate["Human Approval Gate"]
    Gate -->|"Approve"| PR["open_pr() -> GitHub API / dry-run"]
    Gate -->|"Reject"| RejectLog["Log rejection reason (no commit)"]
```

## Key Guardrails

1. **Scoped File Access**: `resolve_scoped_path()` in `mcp_server/tools.py` rejects absolute paths, `..` traversal, null bytes, symlink escapes, and writes to `.git` or `node_modules`.
2. **Plan Before Edit**: The agent generates a short implementation plan before any tool calls are made.
3. **Bounded Retries & Budgets**: Each run is capped at 15 tool calls, 50,000 tokens, and 2 retries on `run_tests` failure.
4. **Explicit Approval Gate**: `open_pr` is never exposed to the autonomous loop; commits and PRs only happen after an explicit `/approve` action.
5. **Structured Logging**: Every step (`phase`, `tool`, `args`, `result`, `tokens_in`, `tokens_out`, `duration_ms`) is persisted as JSON.
