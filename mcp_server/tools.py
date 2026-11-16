"""Core MCP tool implementations scoped to a working copy of /sample-app."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORKDIR = REPO_ROOT / ".work" / "sample-app"
FORBIDDEN_SEGMENTS = {".git", "node_modules"}
INTERNAL_KEYS = {"patch_file", "test_file"}


@dataclass
class MCPConfig:
    """Configuration for MCP tools."""

    repo_root: Path = REPO_ROOT
    workdir: Path = DEFAULT_WORKDIR
    github_token: str = field(default_factory=lambda: os.getenv("GITHUB_TOKEN", ""))
    github_repo: str = field(
        default_factory=lambda: os.getenv("GITHUB_REPO", "varuunnn216/sdlc-agent-orchestrator")
    )
    dry_run: bool = field(
        default_factory=lambda: os.getenv("DRY_RUN", "false").lower() == "true"
    )


def _sanitize_item(item: dict[str, Any]) -> dict[str, Any]:
    """Strip internal harness fields (patch/test paths) from a work item."""
    return {k: v for k, v in item.items() if k not in INTERNAL_KEYS}


def _load_all_items(repo_root: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for filename in ("stories.json", "bugs.json"):
        path = repo_root / "backlog" / filename
        if path.exists():
            items.extend(json.loads(path.read_text(encoding="utf-8")))
    return items


def resolve_scoped_path(workdir: Path, rel_path: str) -> Path:
    """Resolve a relative path strictly within `workdir`, rejecting traversal."""
    if not rel_path or "\x00" in rel_path:
        raise ValueError("Invalid path: path must be a non-empty string.")

    candidate = Path(rel_path)
    if candidate.is_absolute():
        raise ValueError(f"Path traversal rejected (absolute path): {rel_path}")

    root = workdir.resolve()
    resolved = (root / candidate).resolve()

    try:
        relative = resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Path traversal rejected (escapes workdir): {rel_path}") from exc

    if any(part in FORBIDDEN_SEGMENTS for part in relative.parts):
        raise ValueError(f"Access to protected directory rejected: {rel_path}")

    return resolved


def list_work_items(
    item_type: str | None = None,
    status: str | None = None,
    config: MCPConfig | None = None,
) -> list[dict[str, Any]]:
    """List backlog work items filtered by optional type ('bug'|'story') and status."""
    cfg = config or MCPConfig()
    items = _load_all_items(cfg.repo_root)

    if item_type and item_type.lower() != "all":
        items = [i for i in items if i.get("type", "").lower() == item_type.lower()]
    if status and status.lower() != "all":
        items = [i for i in items if i.get("status", "").lower() == status.lower()]

    return [_sanitize_item(i) for i in items]


def get_work_item(item_id: str, config: MCPConfig | None = None) -> dict[str, Any]:
    """Return a single backlog work item by ID."""
    cfg = config or MCPConfig()
    for item in _load_all_items(cfg.repo_root):
        if item.get("id") == item_id:
            return _sanitize_item(item)
    raise ValueError(f"Work item not found: {item_id}")


def read_file(path: str, config: MCPConfig | None = None) -> str:
    """Read a UTF-8 file inside the working copy."""
    cfg = config or MCPConfig()
    target = resolve_scoped_path(cfg.workdir, path)
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    return target.read_text(encoding="utf-8")


def write_file(
    path: str, content: str, config: MCPConfig | None = None
) -> dict[str, Any]:
    """Write UTF-8 content to a file inside the working copy."""
    cfg = config or MCPConfig()
    target = resolve_scoped_path(cfg.workdir, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": path, "bytes_written": len(content.encode("utf-8"))}


def run_tests(config: MCPConfig | None = None, timeout: int = 60) -> dict[str, Any]:
    """Run Vitest in the working copy and return pass/fail plus combined output."""
    cfg = config or MCPConfig()
    if not cfg.workdir.exists():
        raise FileNotFoundError(f"Working copy does not exist: {cfg.workdir}")

    local_bin = str(Path.home() / ".local" / "bin")
    base_path = os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    clean_path = f"{local_bin}:{base_path}" if local_bin not in base_path else base_path
    env = {
        "PATH": clean_path,
        "HOME": os.environ.get("HOME", "/tmp"),
        "TMPDIR": os.environ.get("TMPDIR", "/tmp"),
        "NODE_ENV": "test",
        "CI": "true",
    }

    result = subprocess.run(
        ["npm", "test"],
        cwd=cfg.workdir,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    output = (result.stdout + "\n" + result.stderr).strip()
    return {
        "passed": result.returncode == 0,
        "returncode": result.returncode,
        "output": output,
    }


def open_pr(
    branch: str,
    title: str,
    body: str,
    dry_run: bool | None = None,
    config: MCPConfig | None = None,
) -> dict[str, Any]:
    """Open a GitHub pull request from the working copy, or simulate in dry-run mode."""
    cfg = config or MCPConfig()
    is_dry_run = cfg.dry_run if dry_run is None else dry_run

    if not branch.strip() or not title.strip():
        raise ValueError("Branch and title must be non-empty.")

    if is_dry_run:
        return {
            "dry_run": True,
            "status": "simulated",
            "branch": branch,
            "title": title,
            "body": body,
            "pr_url": f"https://github.com/{cfg.github_repo}/pull/dry-run",
        }

    if not cfg.github_token:
        raise ValueError("GITHUB_TOKEN is required to open a real PR.")

    # Create branch, commit changes in workdir, and push to origin if configured.
    subprocess.run(["git", "checkout", "-B", branch], cwd=cfg.workdir, check=True)
    subprocess.run(["git", "add", "-A"], cwd=cfg.workdir, check=True)
    subprocess.run(
        ["git", "commit", "--allow-empty", "-m", title],
        cwd=cfg.workdir,
        check=True,
    )

    remotes = subprocess.run(
        ["git", "remote"], cwd=cfg.workdir, capture_output=True, text=True, check=True
    ).stdout.split()
    if "origin" in remotes:
        subprocess.run(
            ["git", "push", "-u", "origin", branch], cwd=cfg.workdir, check=True
        )

    response = httpx.post(
        f"https://api.github.com/repos/{cfg.github_repo}/pulls",
        headers={
            "Authorization": f"Bearer {cfg.github_token}",
            "Accept": "application/vnd.github+json",
        },
        json={"title": title, "head": branch, "base": "main", "body": body},
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    return {
        "dry_run": False,
        "status": "created",
        "branch": branch,
        "pr_number": data.get("number"),
        "pr_url": data.get("html_url"),
    }
