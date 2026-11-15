"""Apply a seeded bug patch or story acceptance test to a clean working copy."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from reset import DEFAULT_WORKDIR, REPO_ROOT, reset_workdir


def load_work_items() -> dict[str, dict]:
    """Load all bugs and stories indexed by ID."""
    items: dict[str, dict] = {}
    for filename in ("bugs.json", "stories.json"):
        path = REPO_ROOT / "backlog" / filename
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data:
            items[item["id"]] = item
    return items


def apply_case(case_id: str, workdir: Path = DEFAULT_WORKDIR) -> dict:
    """Create a clean working copy and apply the given bug patch or story test."""
    items = load_work_items()
    if case_id not in items:
        raise ValueError(f"Unknown case ID: {case_id}")

    item = items[case_id]
    reset_workdir(workdir, init_git=True)

    if item["type"] == "bug":
        patch_path = REPO_ROOT / item["patch_file"]
        subprocess.run(
            ["git", "apply", str(patch_path)],
            cwd=workdir,
            check=True,
        )
    elif item["type"] == "story":
        src_test = REPO_ROOT / item["test_file"]
        dst_test = workdir / "src" / "test" / f"acceptance_{case_id}.test.tsx"
        shutil.copy2(src_test, dst_test)
    else:
        raise ValueError(f"Unsupported item type: {item['type']}")

    # Commit the seeded state so `git diff` only shows the agent's changes.
    subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", f"seed: {case_id}"],
        cwd=workdir,
        check=True,
    )
    return item


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply a bug or story case")
    parser.add_argument("case_id", help="Work item ID (e.g., BUG-1 or STORY-1)")
    parser.add_argument(
        "--workdir",
        type=Path,
        default=DEFAULT_WORKDIR,
        help="Target working copy directory (default: .work/sample-app)",
    )
    args = parser.parse_args()

    try:
        item = apply_case(args.case_id, args.workdir)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Applied {item['id']} ({item['type']} - {item['difficulty']}) to {args.workdir}")


if __name__ == "__main__":
    main()
