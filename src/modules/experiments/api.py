"""Module 10 — Experiment tracker backend (CRUD + sim-vs-data fit)."""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from shared.db import repo

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


class ExperimentBody(BaseModel):
    title: str = "Untitled experiment"
    project_id: Optional[int] = None
    design_id: Optional[int] = None
    design_version_no: Optional[int] = None
    exp_type: str = "expression"
    date: Optional[str] = None
    protocol_ref: Optional[str] = None
    columns: list[str] = []
    rows: list[list] = []
    notes_md: str = ""


@router.post("")
def create(body: ExperimentBody) -> dict:
    return repo.create_experiment(body.model_dump())


@router.get("")
def list_all() -> list[dict]:
    return repo.list_experiments()


@router.get("/{exp_id}")
def get(exp_id: int) -> dict:
    exp = repo.get_experiment(exp_id)
    if exp is None:
        raise HTTPException(status_code=404, detail=f"Experiment {exp_id} not found.")
    return exp


@router.put("/{exp_id}")
def update(exp_id: int, body: ExperimentBody) -> dict:
    exp = repo.update_experiment(exp_id, body.model_dump())
    if exp is None:
        raise HTTPException(status_code=404, detail=f"Experiment {exp_id} not found.")
    return exp


@router.delete("/{exp_id}")
def delete(exp_id: int) -> dict:
    if not repo.delete_experiment(exp_id):
        raise HTTPException(status_code=404, detail=f"Experiment {exp_id} not found.")
    return {"deleted": exp_id}


class FitRequest(BaseModel):
    simulation: list[float]   # predicted reporter values
    measured: list[float]     # experimental measurements (same length / resampled)


@router.post("/fit")
def fit(req: FitRequest) -> dict:
    """R² goodness-of-fit between a simulation curve and measured data."""
    sim, obs = req.simulation, req.measured
    n = min(len(sim), len(obs))
    if n < 2:
        raise HTTPException(status_code=400, detail="Need at least two paired points.")
    sim, obs = sim[:n], obs[:n]
    mean = sum(obs) / n
    ss_tot = sum((o - mean) ** 2 for o in obs)
    ss_res = sum((o - s) ** 2 for o, s in zip(obs, sim))
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"r_squared": round(r2, 4), "n": n}
