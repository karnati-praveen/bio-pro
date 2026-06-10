"""CRISPR guide RNA design endpoint."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules.crispr import core as crispr

router = APIRouter(prefix="/api/crispr", tags=["crispr"])


class GuideRequest(BaseModel):
    sequence: str
    enzyme: str = "SpCas9"
    strand: str = "both"
    max_guides: int = 20


@router.post("/guides")
def design_guides(req: GuideRequest) -> dict:
    try:
        guides = crispr.design_guides(
            req.sequence, req.enzyme, req.strand, req.max_guides
        )
        return {
            "guides": guides,
            "enzyme": req.enzyme,
            "enzyme_info": crispr.ENZYMES.get(req.enzyme, {}),
            "sequence_length": len(
                req.sequence.upper().replace(" ", "").replace("\n", "").replace("\r", "")
            ),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/enzymes")
def list_enzymes() -> dict:
    return {"enzymes": list(crispr.ENZYMES.keys()), "details": crispr.ENZYMES}
