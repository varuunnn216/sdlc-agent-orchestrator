"""FastMCP stdio server exposing SDLC Agent Orchestrator tools."""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from mcp_server import tools

mcp = FastMCP("sdlc-agent-orchestrator")


@mcp.tool()
def list_work_items(type: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    """List backlog work items filtered by optional type ('bug'|'story') and status."""
    return tools.list_work_items(item_type=type, status=status)


@mcp.tool()
def get_work_item(id: str) -> dict[str, Any]:
    """Get full details for a single backlog work item by ID."""
    return tools.get_work_item(item_id=id)


@mcp.tool()
def read_file(path: str) -> str:
    """Read a file inside the scoped sample-app working copy."""
    return tools.read_file(path=path)


@mcp.tool()
def write_file(path: str, content: str) -> dict[str, Any]:
    """Write content to a file inside the scoped sample-app working copy."""
    return tools.write_file(path=path, content=content)


@mcp.tool()
def run_tests() -> dict[str, Any]:
    """Run the Vitest suite in the sample-app working copy."""
    return tools.run_tests()


@mcp.tool()
def open_pr(branch: str, title: str, body: str, dry_run: bool = False) -> dict[str, Any]:
    """Open a GitHub pull request (or simulate in dry-run mode)."""
    return tools.open_pr(branch=branch, title=title, body=body, dry_run=dry_run)


if __name__ == "__main__":
    mcp.run()
