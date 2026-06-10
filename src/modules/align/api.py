"""Sequence alignment API: global, local, and multiple-sequence alignment."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from modules.align import core as align

router = APIRouter(prefix="/api/align", tags=["align"])


class SeqEntry(BaseModel):
    name: str = "seq"
    seq: str

    @field_validator("seq")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("sequence must not be empty")
        return v


class AlignRequest(BaseModel):
    mode: str = "global"        # global | local | msa
    sequences: list[SeqEntry]
    match: int = 1
    mismatch: int = -1
    gap: int = -2

    @field_validator("mode")
    @classmethod
    def valid_mode(cls, v: str) -> str:
        if v not in ("global", "local", "msa"):
            raise ValueError("mode must be global, local, or msa")
        return v

    @field_validator("sequences")
    @classmethod
    def at_least_one(cls, v: list[SeqEntry]) -> list[SeqEntry]:
        if len(v) < 1:
            raise ValueError("at least one sequence required")
        if len(v) > 20:
            raise ValueError("at most 20 sequences supported")
        return v


@router.post("")
def run_alignment(req: AlignRequest) -> dict:
    seqs = [{"name": s.name, "seq": s.seq} for s in req.sequences]
    kw = {"match": req.match, "mismatch": req.mismatch, "gap": req.gap}

    try:
        if req.mode == "msa":
            if len(seqs) < 2:
                raise ValueError("MSA requires at least 2 sequences")
            result = align.msa_center_star(seqs, **kw)
            return {"mode": "msa", **result}

        # Pairwise: exactly 2 sequences
        if len(seqs) != 2:
            raise ValueError(f"mode={req.mode} requires exactly 2 sequences")

        a, b = seqs[0]["seq"], seqs[1]["seq"]
        fn = align.needleman_wunsch if req.mode == "global" else align.smith_waterman
        pair = fn(a, b, **kw)

        return {
            "mode": req.mode,
            "sequences": [
                {"name": seqs[0]["name"], "aligned": pair["aligned_a"]},
                {"name": seqs[1]["name"], "aligned": pair["aligned_b"]},
            ],
            "score": pair["score"],
            "identity": pair["identity"],
            "conservation": pair["conservation"],
            "consensus": _pairwise_consensus(pair["aligned_a"], pair["aligned_b"]),
            "identity_matrix": [
                [1.0, pair["identity"]],
                [pair["identity"], 1.0],
            ],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _pairwise_consensus(a: str, b: str) -> str:
    out = []
    for ca, cb in zip(a, b):
        if ca == cb and ca != "-":
            out.append(ca)
        elif ca == "-" or cb == "-":
            out.append("-")
        else:
            out.append("?")
    return "".join(out)
