"""Module 8 — Primer design backend."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules import primers

router = APIRouter(prefix="/api/primers", tags=["primers"])


class PrimerRequest(BaseModel):
    sequence: str
    target_tm: float = 60.0
    min_len: int = 18
    max_len: int = 25
    primer_nM: float = 500.0
    na_mM: float = 50.0


@router.post("/design")
def design(req: PrimerRequest) -> dict:
    try:
        primer_pair = primers.design_primers(
            req.sequence, req.target_tm, req.min_len, req.max_len, req.primer_nM, req.na_mM
        )
        return {"primers": primer_pair}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TmRequest(BaseModel):
    sequence: str


@router.post("/tm")
def tm(req: TmRequest) -> dict:
    return {"tm": primers.nn_tm(req.sequence), "gc": primers.gc_percent(req.sequence)}
