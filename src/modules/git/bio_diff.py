"""Bio-aware diff helpers for sequences, circuits, and plain text."""

from __future__ import annotations

import difflib
import json
import re


def _clean_seq(text: str) -> str:
    return re.sub(r"[^ACGTUNacgtun]", "", text).upper()


def sequence_diff(old_content: str, new_content: str, filename: str = "") -> dict:
    """Return per-base insertions/deletions for FASTA/GenBank files."""
    ext = (filename or "").lower()
    if ext.endswith((".gb", ".gbk")) or old_content.lstrip().startswith("LOCUS"):
        old_seq = _extract_seq_from_genbank(old_content)
        new_seq = _extract_seq_from_genbank(new_content)
    else:
        old_seq = _extract_seq_from_fasta(old_content)
        new_seq = _extract_seq_from_fasta(new_content)

    opcodes = difflib.SequenceMatcher(None, old_seq, new_seq, autojunk=False).get_opcodes()
    hunks = []
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == "equal":
            continue
        if tag in ("replace", "delete"):
            hunks.append({"type": "del", "pos": i1, "bases": old_seq[i1:i2]})
        if tag in ("replace", "insert"):
            hunks.append({"type": "ins", "pos": j1, "bases": new_seq[j1:j2]})
    return {
        "kind": "sequence",
        "old_len": len(old_seq),
        "new_len": len(new_seq),
        "net": len(new_seq) - len(old_seq),
        "hunks": hunks,
    }


def circuit_diff(old_content: str, new_content: str) -> dict:
    """Return added/removed/modified parts for .biopro / JSON circuit files."""
    old_parts = _extract_parts(old_content)
    new_parts = _extract_parts(new_content)
    old_set, new_set = set(old_parts), set(new_parts)
    added = sorted(new_set - old_set)
    removed = sorted(old_set - new_set)
    return {
        "kind": "circuit",
        "added": added,
        "removed": removed,
        "unchanged": sorted(old_set & new_set),
    }


def text_diff(old_content: str, new_content: str) -> dict:
    """Unified-diff lines for generic text files."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    hunks = list(difflib.unified_diff(old_lines, new_lines, lineterm=""))
    return {"kind": "text", "hunks": hunks}


def bio_diff(filename: str, old_content: str, new_content: str) -> dict:
    ext = (filename or "").lower()
    if ext.endswith((".fasta", ".fa", ".gb", ".gbk")):
        return sequence_diff(old_content, new_content, filename)
    if ext.endswith((".biopro", ".sbol")):
        return circuit_diff(old_content, new_content)
    return text_diff(old_content, new_content)


def suggest_commit_message(diffs: list[dict], design_name: str = "") -> str:
    """Generate a one-line commit message from a list of bio_diff results."""
    notes = []
    for d in diffs:
        kind = d.get("kind")
        if kind == "sequence":
            net = d.get("net", 0)
            if net > 0:
                notes.append(f"Inserted {net} bp in {design_name or 'sequence'}")
            elif net < 0:
                notes.append(f"Deleted {abs(net)} bp from {design_name or 'sequence'}")
            else:
                notes.append(f"Modified {design_name or 'sequence'} (net 0 bp)")
        elif kind == "circuit":
            added = d.get("added", [])
            removed = d.get("removed", [])
            parts = []
            if added:
                parts.append(f"Added {', '.join(added[:2])}")
            if removed:
                parts.append(f"Removed {', '.join(removed[:2])}")
            if parts:
                ctx = f" in {design_name}" if design_name else ""
                notes.append("; ".join(parts) + ctx)
    if notes:
        return "; ".join(notes)
    return f"Update {design_name}" if design_name else "Update design files"


# ---------- internal helpers ------------------------------------------------ #

def _extract_seq_from_fasta(text: str) -> str:
    return _clean_seq("".join(
        ln for ln in text.splitlines() if not ln.startswith(">")
    ))


def _extract_seq_from_genbank(text: str) -> str:
    m = re.search(r"(?is)ORIGIN(.*?)//", text)
    if m:
        return _clean_seq(re.sub(r"[\d\s]", "", m.group(1)))
    return ""


def _extract_parts(content: str) -> list[str]:
    """Try JSON parse first; fall back to regex scan for part-like tokens."""
    try:
        data = json.loads(content)
        parts: list[str] = []
        if isinstance(data, dict):
            for tu in data.get("circuit", {}).get("transcription_units", []):
                parts.extend(tu.get("parts", []))
            if not parts:
                for node in data.get("circuit", {}).get("nodes", []):
                    parts.append(node.get("id") or node.get("label") or "")
        return [p for p in parts if p]
    except (json.JSONDecodeError, AttributeError, TypeError):
        # .biopro DSL — grab tokens that look like part names (uppercase IDs)
        return re.findall(r"\b[A-Z][A-Za-z0-9_]{2,}\b", content)
