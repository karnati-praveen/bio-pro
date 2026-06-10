"""Module: Plasmid map layout renderer.

POST /api/seqmap/render — accepts FASTA/GenBank text or a compiled circuit
JSON blob and returns the layout model for PlasmidMap.jsx.
"""

from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from modules.seqmap import core

router = APIRouter(prefix="/api/seqmap", tags=["seqmap"])


class SeqMapRequest(BaseModel):
    filename: str = "sequence"
    content: str = ""
    extra_features: list[dict[str, Any]] = []
    topology: Optional[str] = None
    compile_result: Optional[dict[str, Any]] = None


@router.post("/render")
def render(req: SeqMapRequest) -> dict:
    """Compute the plasmid map layout and return it as JSON."""
    return core.render_layout(
        filename=req.filename,
        content=req.content,
        extra_features=req.extra_features or [],
        topology_override=req.topology,
        compile_result=req.compile_result,
    )
