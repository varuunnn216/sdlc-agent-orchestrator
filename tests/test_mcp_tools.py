"""Unit tests for MCP tools, focusing on path scoping, backlog access, and dry-run PRs."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from mcp_server.tools import (
    MCPConfig,
    get_work_item,
    list_work_items,
    open_pr,
    read_file,
    resolve_scoped_path,
    run_tests,
    write_file,
)


@pytest.fixture()
def scoped_config(tmp_path: Path) -> MCPConfig:
    workdir = tmp_path / "workdir"
    workdir.mkdir()
    (workdir / "src").mkdir()
    (workdir / "src" / "App.tsx").write_text("export default function App() {}", encoding="utf-8")
    return MCPConfig(workdir=workdir, dry_run=True)


def test_list_and_get_work_items() -> None:
    all_items = list_work_items()
    assert len(all_items) == 16

    bugs = list_work_items(item_type="bug", status="open")
    assert len(bugs) == 6
    assert all(b["type"] == "bug" for b in bugs)
    assert all("patch_file" not in b for b in bugs)

    stories = list_work_items(item_type="story")
    assert len(stories) == 10
    assert all("test_file" not in s for s in stories)

    item = get_work_item("BUG-1")
    assert item["id"] == "BUG-1"
    assert "patch_file" not in item

    with pytest.raises(ValueError, match="Work item not found"):
        get_work_item("NOPE-999")


def test_read_and_write_file_within_scope(scoped_config: MCPConfig) -> None:
    content = read_file("src/App.tsx", config=scoped_config)
    assert "function App" in content

    res = write_file("src/utils/newHelper.ts", "export const x = 1;\n", config=scoped_config)
    assert res["bytes_written"] == 20
    assert read_file("src/utils/newHelper.ts", config=scoped_config) == "export const x = 1;\n"


@pytest.mark.parametrize(
    "bad_path",
    [
        "",
        "../secret.txt",
        "src/../../outside.txt",
        "/etc/passwd",
        "src/\x00evil.ts",
        ".git/config",
        "node_modules/pkg/index.js",
    ],
)
def test_path_traversal_and_protected_dirs_rejected(
    scoped_config: MCPConfig, bad_path: str
) -> None:
    with pytest.raises(ValueError):
        resolve_scoped_path(scoped_config.workdir, bad_path)

    with pytest.raises(ValueError):
        read_file(bad_path, config=scoped_config)

    with pytest.raises(ValueError):
        write_file(bad_path, "malicious", config=scoped_config)


def test_symlink_escape_rejected(scoped_config: MCPConfig, tmp_path: Path) -> None:
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")

    link_path = scoped_config.workdir / "src" / "escape.txt"
    os.symlink(outside, link_path)

    with pytest.raises(ValueError, match="Path traversal rejected"):
        read_file("src/escape.txt", config=scoped_config)

    with pytest.raises(ValueError, match="Path traversal rejected"):
        write_file("src/escape.txt", "overwrite", config=scoped_config)


def test_run_tests_pass_and_fail(scoped_config: MCPConfig) -> None:
    with patch("mcp_server.tools.subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["npm", "test"], returncode=0, stdout="7 passed", stderr=""
        )
        res = run_tests(config=scoped_config)
        assert res["passed"] is True
        assert "7 passed" in res["output"]

        mock_run.return_value = subprocess.CompletedProcess(
            args=["npm", "test"], returncode=1, stdout="1 failed", stderr="err"
        )
        res = run_tests(config=scoped_config)
        assert res["passed"] is False
        assert "1 failed" in res["output"]


def test_open_pr_dry_run_and_real_api(scoped_config: MCPConfig) -> None:
    dry = open_pr(
        branch="fix/bug-1",
        title="Fix BUG-1",
        body="Fixes subtotal",
        dry_run=True,
        config=scoped_config,
    )
    assert dry["dry_run"] is True
    assert dry["status"] == "simulated"
    assert dry["branch"] == "fix/bug-1"

    no_token_cfg = MCPConfig(workdir=scoped_config.workdir, github_token="", dry_run=False)
    with pytest.raises(ValueError, match="GITHUB_TOKEN"):
        open_pr("fix/bug-1", "Fix BUG-1", "body", dry_run=False, config=no_token_cfg)

    token_cfg = MCPConfig(
        workdir=scoped_config.workdir,
        github_token="fake-token",
        github_repo="varuunnn216/sdlc-agent-orchestrator",
        dry_run=False,
    )
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"number": 42, "html_url": "https://github.com/example/pull/42"}
    with (
        patch("mcp_server.tools.subprocess.run") as mock_sub,
        patch("mcp_server.tools.httpx.post", return_value=mock_resp) as mock_post,
    ):
        mock_sub.return_value = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        created = open_pr("fix/bug-1", "Fix BUG-1", "body", dry_run=False, config=token_cfg)
        assert created["dry_run"] is False
        assert created["pr_number"] == 42
        mock_post.assert_called_once()
