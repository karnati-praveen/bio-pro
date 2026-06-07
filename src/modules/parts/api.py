"""Module 3 — Parts library extensions: custom parts, GenBank import, cross-reactivity."""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules import sequence as seqmod
from shared.db import repo
from modules.compiler.rules import CROSS_REACTIVITY_REGULATORS, CROSS_REACTIVITY_MATRIX

router = APIRouter(prefix="/api/parts", tags=["parts"])

# Map GenBank feature types to library part types.
_FEATURE_TYPE_MAP = {
    "promoter": "promoter", "CDS": "cds", "gene": "cds", "RBS": "rbs",
    "terminator": "terminator", "operator": "operator",
    "protein_bind": "operator", "misc_feature": "operator",
}


class CustomPart(BaseModel):
    id: str
    name: Optional[str] = None
    type: str
    role: Optional[str] = None
    seq: Optional[str] = None
    description: Optional[str] = None
    host_compatibility: Optional[list[str]] = None
    kinetic_parameters: Optional[dict] = None
    color: Optional[str] = None
    source_doi: Optional[str] = None


class ImportRequest(BaseModel):
    filename: str = "import.gb"
    content: str


@router.post("")
def create_custom_part(part: CustomPart) -> dict:
    try:
        return repo.create_part(part.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/import")
def import_genbank(req: ImportRequest) -> dict:
    """Parse a GenBank/FASTA file and add each annotated feature as a custom part."""
    parsed = seqmod.parse_sequence(req.filename, req.content)
    seq = parsed["sequence"]
    added: list[dict] = []
    for i, f in enumerate(parsed.get("features", [])):
        ptype = _FEATURE_TYPE_MAP.get(f["type"], "operator")
        sub = seq[f["start"]:f["end"]]
        label = f.get("label") or f"{f['type']}_{i}"
        pid = f"custom_{label}".replace(" ", "_")[:60]
        try:
            added.append(repo.create_part({
                "id": pid, "name": label, "type": ptype, "seq": sub,
                "description": f"Imported from {parsed['name']} ({f['start']+1}-{f['end']})",
                "host_compatibility": ["ecoli"],
            }))
        except ValueError:
            continue
    return {"added": added, "count": len(added), "source": parsed["name"]}


@router.get("/cross-reactivity")
def cross_reactivity() -> dict:
    return {"regulators": CROSS_REACTIVITY_REGULATORS, "matrix": CROSS_REACTIVITY_MATRIX}
