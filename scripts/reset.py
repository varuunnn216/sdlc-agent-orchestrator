"""Reset or initialize a clean working copy of /sample-app."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_APP = REPO_ROOT / "sample-app"
DEFAULT_WORKDIR = REPO_ROOT / ".work" / "sample-app"


def reset_workdir(workdir: Path = DEFAULT_WORKDIR, init_git: bool = True) -> Path:
    """Replace workdir with a fresh copy of /sample-app and symlink node_modules."""
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.parent.mkdir(parents=True, exist_ok=True)

    ignore = shutil.ignore_patterns("node_modules", "dist", ".git")
    shutil.copytree(SAMPLE_APP, workdir, ignore=ignore)

    src_modules = SAMPLE_APP / "node_modules"
    if src_modules.exists():
        os.symlink(src_modules, workdir / "node_modules")

    if init_git:
        subprocess.run(["git", "init", "-q"], cwd=workdir, check=True)
        subprocess.run(["git", "config", "user.name", "agent"], cwd=workdir, check=True)
        subprocess.run(
            ["git", "config", "user.email", "agent@example.com"],
            cwd=workdir,
            check=True,
        )
        subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
        subprocess.run(
            ["git", "commit", "-q", "-m", "baseline"],
            cwd=workdir,
            check=True,
        )

    return workdir


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset working copy of sample-app")
    parser.add_argument(
        "--workdir",
        type=Path,
        default=DEFAULT_WORKDIR,
        help="Target working copy directory (default: .work/sample-app)",
    )
    args = parser.parse_args()
    target = reset_workdir(args.workdir)
    print(f"Reset working copy at {target}")


if __name__ == "__main__":
    main()
