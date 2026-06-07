"""Module 2 — DNA sequence editor backend.

Parse/analyse sequences: FASTA/GenBank parsing, reverse-complement, translation,
GC content, ORF finding, and restriction-site mapping.
"""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from modules import sequence as seqmod

router = APIRouter(prefix="/api/sequence", tags=["sequence"])


class ParseRequest(BaseModel):
    filename: str = "sequence.fasta"
    content: str


class SeqRequest(BaseModel):
    sequence: str


class TranslateRequest(BaseModel):
    sequence: str
    frame: int = 0


class GCRequest(BaseModel):
    sequence: str
    window: int = 50


class ORFRequest(BaseModel):
    sequence: str
    min_len: int = 90


class RestrictionRequest(BaseModel):
    sequence: str
    enzymes: Optional[list[str]] = None


@router.post("/parse")
def parse(req: ParseRequest) -> dict:
    return seqmod.parse_sequence(req.filename, req.content)


@router.post("/revcomp")
def revcomp(req: SeqRequest) -> dict:
    return {"sequence": seqmod.reverse_complement(req.sequence)}


@router.post("/translate")
def translate(req: TranslateRequest) -> dict:
    return seqmod.translate(req.sequence, req.frame)


@router.post("/gc")
def gc(req: GCRequest) -> dict:
    return seqmod.gc_content(req.sequence, req.window)


@router.post("/orfs")
def orfs(req: ORFRequest) -> dict:
    return {"orfs": seqmod.find_orfs(req.sequence, req.min_len)}


@router.post("/restriction")
def restriction(req: RestrictionRequest) -> dict:
    return {
        "sites": seqmod.restriction_sites(req.sequence, req.enzymes),
        "enzymes": list(seqmod.ENZYMES.keys()),
    }


@router.get("/enzymes")
def enzymes() -> dict:
    return {"enzymes": seqmod.ENZYMES}
