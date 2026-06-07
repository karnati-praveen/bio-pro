"""Module 4 — Simulation Workbench backend.

Deterministic re-simulation with parameter/duration overrides, automated sensitivity
analysis (tornado data), and persistent simulation-run history.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from shared.schemas.schemas import CompileResponse, SimParams, Simulation
from modules.simulation import ode
from shared.db import repo

router = APIRouter(prefix="/api", tags=["simulation"])


class SimulateRequest(BaseModel):
    compile_result: CompileResponse
    params: Optional[SimParams] = None


@router.post("/simulate")
def simulate(req: SimulateRequest) -> Simulation:
    """Re-run the deterministic ODE for a compiled circuit with parameter overrides."""
    try:
        return ode.simulate(req.compile_result.spec, req.params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/simulate/sensitivity")
def sensitivity(result: CompileResponse) -> dict:
    """Automated sensitivity analysis across all kinetic parameters (tornado chart)."""
    try:
        return ode.sensitivity_analysis(result.spec, result.spec.organism)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SaveRunRequest(BaseModel):
    label: str = ""
    mode: str = "ode"
    organism: Optional[str] = None
    params: dict = {}
    summary: dict = {}
    design_id: Optional[int] = None


@router.post("/simulations")
def save_run(body: SaveRunRequest) -> dict:
    return repo.save_simulation_run(
        body.label, body.mode, body.organism, body.params, body.summary, body.design_id
    )


@router.get("/simulations")
def list_runs() -> list[dict]:
    return repo.list_simulation_runs()


@router.get("/simulations/{run_id}")
def get_run(run_id: int) -> dict:
    run = repo.get_simulation_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Simulation run {run_id} not found.")
    return run
