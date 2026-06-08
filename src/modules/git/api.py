"""Module 9 — Git integration backend.

Runs real git on the project root via subprocess, exposed at /api/git/*.
Bio-aware diff for .fasta/.gb/.biopro files is computed by bio_diff.py.
"""

from __future__ import annotations

import os
import subprocess
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules.git.bio_diff import bio_diff, suggest_commit_message

router = APIRouter(prefix="/api/git", tags=["git"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _run(args: list[str], cwd: str) -> str:
    """Run a git command and return combined stdout; raise HTTPException on error."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=result.stderr.strip() or f"git {args[0]} failed",
            )
        return result.stdout
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="git not found in PATH")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="git command timed out")


def _require_repo(path: str) -> None:
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Invalid project root path.")


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class RootBody(BaseModel):
    root: str


class CommitBody(BaseModel):
    root: str
    message: str
    files: Optional[list[str]] = None   # None → use already-staged files


class StageBody(BaseModel):
    root: str
    files: list[str]
    stage: bool = True


class BranchBody(BaseModel):
    root: str
    name: str


class CheckoutBody(BaseModel):
    root: str
    branch: str


class MergeBody(BaseModel):
    root: str
    branch: str


class PushPullBody(BaseModel):
    root: str
    remote: str = "origin"
    branch: Optional[str] = None


class DiffBody(BaseModel):
    root: str
    filepath: str
    ref_a: Optional[str] = None   # None → working-tree vs HEAD
    ref_b: Optional[str] = None


class RestoreBody(BaseModel):
    root: str
    filepath: str
    commit: str


class SuggestBody(BaseModel):
    root: str
    files: list[str]


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@router.post("/init")
def init_repo(body: RootBody) -> dict:
    """Initialise a git repo in the project root (idempotent)."""
    _require_repo(body.root)
    _run(["init"], cwd=body.root)
    return {"ok": True, "path": body.root}


@router.post("/status")
def repo_status(body: RootBody) -> dict:
    """Return branch name, staged/unstaged file lists, and whether a remote exists."""
    _require_repo(body.root)
    # Branch
    try:
        branch = _run(["rev-parse", "--abbrev-ref", "HEAD"], cwd=body.root).strip()
    except HTTPException:
        branch = "main"
    # Status porcelain v1: "XY filename"
    raw = _run(["status", "--porcelain=v1", "--untracked-files=normal"], cwd=body.root)
    staged, unstaged, untracked = [], [], []
    for line in raw.splitlines():
        if len(line) < 3:
            continue
        xy, path = line[:2], line[3:]
        x, y = xy[0], xy[1]
        if x != " " and x != "?":
            staged.append({"path": path, "status": x})
        if y == "M" or y == "D":
            unstaged.append({"path": path, "status": y})
        if x == "?" and y == "?":
            untracked.append({"path": path, "status": "?"})
    # Remotes
    try:
        remotes_raw = _run(["remote"], cwd=body.root).strip()
        remotes = [r for r in remotes_raw.splitlines() if r]
    except HTTPException:
        remotes = []
    # Ahead/behind
    ahead, behind = 0, 0
    try:
        ab = _run(
            ["rev-list", "--left-right", "--count", f"{branch}...@{{u}}"],
            cwd=body.root,
        ).strip().split()
        if len(ab) == 2:
            ahead, behind = int(ab[0]), int(ab[1])
    except (HTTPException, ValueError):
        pass

    return {
        "branch": branch,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
        "remotes": remotes,
        "ahead": ahead,
        "behind": behind,
    }


@router.post("/stage")
def stage_files(body: StageBody) -> dict:
    _require_repo(body.root)
    cmd = ["add", "--"] + body.files if body.stage else ["restore", "--staged", "--"] + body.files
    _run(cmd, cwd=body.root)
    return {"ok": True}


@router.post("/commit")
def commit(body: CommitBody) -> dict:
    _require_repo(body.root)
    if body.files:
        _run(["add", "--"] + body.files, cwd=body.root)
    out = _run(["commit", "-m", body.message], cwd=body.root)
    return {"ok": True, "output": out.strip()}


@router.post("/log")
def git_log(body: RootBody) -> dict:
    """Return the last 50 commits as structured objects."""
    _require_repo(body.root)
    fmt = "%H%x1f%h%x1f%an%x1f%ae%x1f%ai%x1f%s"
    raw = _run(["log", "--pretty=format:" + fmt, "-50"], cwd=body.root)
    commits = []
    for line in raw.splitlines():
        parts = line.split("\x1f")
        if len(parts) < 6:
            continue
        commits.append({
            "hash": parts[0],
            "short": parts[1],
            "author": parts[2],
            "email": parts[3],
            "date": parts[4],
            "message": parts[5],
        })
    return {"commits": commits}


@router.post("/log/file")
def file_log(body: DiffBody) -> dict:
    """Return commit history for a single file."""
    _require_repo(body.root)
    fmt = "%H%x1f%h%x1f%an%x1f%ai%x1f%s"
    raw = _run(
        ["log", "--pretty=format:" + fmt, "--follow", "--", body.filepath],
        cwd=body.root,
    )
    commits = []
    for line in raw.splitlines():
        parts = line.split("\x1f")
        if len(parts) < 5:
            continue
        commits.append({
            "hash": parts[0],
            "short": parts[1],
            "author": parts[2],
            "date": parts[3],
            "message": parts[4],
        })
    return {"commits": commits, "filepath": body.filepath}


@router.post("/diff")
def file_diff(body: DiffBody) -> dict:
    """Compute a bio-aware diff for a file between two refs (or HEAD vs working tree)."""
    _require_repo(body.root)

    def _show(ref: str, path: str) -> str:
        try:
            return _run(["show", f"{ref}:{path}"], cwd=body.root)
        except HTTPException:
            return ""

    if body.ref_a and body.ref_b:
        old_content = _show(body.ref_a, body.filepath)
        new_content = _show(body.ref_b, body.filepath)
    elif body.ref_a:
        old_content = _show(body.ref_a, body.filepath)
        full_path = os.path.join(body.root, body.filepath)
        try:
            with open(full_path, encoding="utf-8", errors="replace") as fh:
                new_content = fh.read()
        except OSError:
            new_content = ""
    else:
        # HEAD vs working tree
        old_content = _show("HEAD", body.filepath)
        full_path = os.path.join(body.root, body.filepath)
        try:
            with open(full_path, encoding="utf-8", errors="replace") as fh:
                new_content = fh.read()
        except OSError:
            new_content = ""

    result = bio_diff(body.filepath, old_content, new_content)
    result["filepath"] = body.filepath
    return result


@router.post("/restore")
def restore_file(body: RestoreBody) -> dict:
    """Restore a file to its state at a given commit (writes to working tree)."""
    _require_repo(body.root)
    content = _run(["show", f"{body.commit}:{body.filepath}"], cwd=body.root)
    full_path = os.path.join(body.root, body.filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return {"ok": True, "filepath": body.filepath, "restored_to": body.commit}


@router.post("/branches")
def list_branches(body: RootBody) -> dict:
    _require_repo(body.root)
    raw = _run(["branch", "--list", "--format=%(refname:short)\t%(HEAD)"], cwd=body.root)
    branches = []
    for line in raw.splitlines():
        parts = line.split("\t")
        if len(parts) == 2:
            branches.append({"name": parts[0], "current": parts[1] == "*"})
    return {"branches": branches}


@router.post("/branch/create")
def create_branch(body: BranchBody) -> dict:
    _require_repo(body.root)
    _run(["checkout", "-b", body.name], cwd=body.root)
    return {"ok": True, "branch": body.name}


@router.post("/branch/checkout")
def checkout_branch(body: CheckoutBody) -> dict:
    _require_repo(body.root)
    _run(["checkout", body.branch], cwd=body.root)
    return {"ok": True, "branch": body.branch}


@router.post("/branch/merge")
def merge_branch(body: MergeBody) -> dict:
    _require_repo(body.root)
    out = _run(["merge", body.branch], cwd=body.root)
    return {"ok": True, "output": out.strip()}


@router.post("/push")
def push(body: PushPullBody) -> dict:
    _require_repo(body.root)
    args = ["push", body.remote]
    if body.branch:
        args.append(body.branch)
    out = _run(args, cwd=body.root)
    return {"ok": True, "output": out.strip()}


@router.post("/pull")
def pull(body: PushPullBody) -> dict:
    _require_repo(body.root)
    args = ["pull", body.remote]
    if body.branch:
        args.append(body.branch)
    out = _run(args, cwd=body.root)
    return {"ok": True, "output": out.strip()}


@router.post("/suggest-message")
def suggest_message(body: SuggestBody) -> dict:
    """Auto-generate a commit message from staged bio file diffs."""
    _require_repo(body.root)
    diffs: list[dict] = []
    for fpath in body.files:
        try:
            old_content = _run(["show", f"HEAD:{fpath}"], cwd=body.root)
        except HTTPException:
            old_content = ""
        full_path = os.path.join(body.root, fpath)
        try:
            with open(full_path, encoding="utf-8", errors="replace") as fh:
                new_content = fh.read()
        except OSError:
            new_content = ""
        diffs.append(bio_diff(fpath, old_content, new_content))
    design_name = os.path.basename(body.files[0]).rsplit(".", 1)[0] if body.files else ""
    message = suggest_commit_message(diffs, design_name)
    return {"message": message}
