"""Projects API — create/list/get/update/delete projects and attach artifacts."""

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from shared.db import repo

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectBody(BaseModel):
    name: str
    description: str = ""


class UpdateProjectBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SaveOrderBody(BaseModel):
    project_id: Optional[int] = None
    design_id: Optional[int] = None
    vendor: str = ""
    fragment_count: int = 0
    estimated_cost_usd: float = 0.0
    sequences: list = []


@router.post("")
def create(
    body: ProjectBody,
    x_user_email: Optional[str] = Header(default=None),
) -> dict:
    return repo.create_project(body.name, owner_email=x_user_email or "",
                               description=body.description)


@router.get("")
def list_all(x_user_email: Optional[str] = Header(default=None)) -> list[dict]:
    return repo.list_projects(owner_email=x_user_email or None)


@router.get("/{project_id}")
def get(project_id: int) -> dict:
    p = repo.get_project(project_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    return p


@router.put("/{project_id}")
def update(project_id: int, body: UpdateProjectBody) -> dict:
    p = repo.update_project(project_id, name=body.name, description=body.description)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    return p


@router.delete("/{project_id}")
def delete(project_id: int) -> dict:
    if not repo.delete_project(project_id):
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    return {"deleted": project_id}


@router.put("/{project_id}/designs/{design_id}")
def attach_design(project_id: int, design_id: int) -> dict:
    if not repo.attach_design_to_project(project_id, design_id):
        raise HTTPException(status_code=404, detail=f"Design {design_id} not found.")
    return {"ok": True, "project_id": project_id, "design_id": design_id}


@router.put("/{project_id}/simulations/{sim_id}")
def attach_simulation(project_id: int, sim_id: int) -> dict:
    if not repo.attach_simulation_to_project(project_id, sim_id):
        raise HTTPException(status_code=404, detail=f"Simulation run {sim_id} not found.")
    return {"ok": True, "project_id": project_id, "sim_id": sim_id}


@router.put("/{project_id}/experiments/{exp_id}")
def attach_experiment(project_id: int, exp_id: int) -> dict:
    if not repo.attach_experiment_to_project(project_id, exp_id):
        raise HTTPException(status_code=404, detail=f"Experiment {exp_id} not found.")
    return {"ok": True, "project_id": project_id, "exp_id": exp_id}


@router.post("/orders")
def save_order(body: SaveOrderBody) -> dict:
    return repo.save_order(
        project_id=body.project_id,
        design_id=body.design_id,
        vendor=body.vendor,
        fragment_count=body.fragment_count,
        estimated_cost_usd=body.estimated_cost_usd,
        sequences=body.sequences,
    )


@router.get("/orders/list")
def list_orders(project_id: Optional[int] = None) -> list[dict]:
    return repo.list_orders(project_id=project_id)
