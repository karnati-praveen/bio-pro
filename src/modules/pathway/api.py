"""Module 12 — Pathway designer + simplified FBA backend."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules import pathway

router = APIRouter(prefix="/api/pathway", tags=["pathway"])


class FbaRequest(BaseModel):
    metabolites: list[str]
    reactions: list[dict]
    objective: str


@router.post("/fba")
def fba(req: FbaRequest) -> dict:
    try:
        return pathway.run_fba(req.metabolites, req.reactions, req.objective)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/templates")
def templates() -> dict:
    return {"templates": pathway.list_templates()}


@router.get("/templates/{template_id}")
def template(template_id: str) -> dict:
    tpl = pathway.get_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found.")
    return tpl
