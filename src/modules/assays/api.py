"""Assay Simulator API — /api/assays/* endpoints.

Each endpoint accepts a Simulation or standalone parameters, calls the
corresponding core function, and returns plottable JSON.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from shared.schemas.schemas import Simulation
from modules.assays import core

router = APIRouter(prefix="/api/assays", tags=["assays"])


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class FlowRequest(BaseModel):
    simulation: Simulation
    n_cells: int = Field(1000, ge=10, le=100_000)
    gate_threshold: Optional[float] = Field(None, gt=0)
    noise_cv: float = Field(0.35, gt=0.0, le=2.0)
    seed: Optional[int] = None


class PlateRequest(BaseModel):
    simulation: Simulation
    conditions: Optional[list[float]] = Field(
        None, description="Inducer concentrations; defaults to 12 log-spaced values 0.1–100"
    )
    n_conditions: int = Field(12, ge=2, le=96)


class QpcrRequest(BaseModel):
    copy_estimates: list[float] = Field(
        default=[1e6, 1e5, 1e4, 1e3, 1e2],
        description="Starting template copy numbers (e.g. [1e6, 1e5, 1e4, 1e3, 1e2])",
    )


class GelFragment(BaseModel):
    name: str
    length: int = Field(..., ge=1, description="Fragment length in bp")


class GelRequest(BaseModel):
    fragments: list[GelFragment]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _reporter(sim: Simulation):
    """Return the reporter Series (is_reporter=True) or the last series."""
    rep = next((s for s in sim.series if s.is_reporter), None)
    if rep is None:
        if not sim.series:
            raise ValueError("Simulation has no series.")
        rep = sim.series[-1]
    return rep


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@router.post("/flow-cytometry")
def flow_cytometry(req: FlowRequest) -> dict:
    """Predicted flow cytometry histogram from ODE reporter distribution."""
    try:
        rep = _reporter(req.simulation)
        return core.flow_cytometry(
            rep.values,
            n_cells=req.n_cells,
            gate_threshold=req.gate_threshold,
            noise_cv=req.noise_cv,
            seed=req.seed,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/plate-reader")
def plate_reader(req: PlateRequest) -> dict:
    """OD + fluorescence time-courses across an inducer titration."""
    try:
        rep = _reporter(req.simulation)
        return core.plate_reader(
            req.simulation.t,
            rep.values,
            conditions=req.conditions,
            n_conditions=req.n_conditions,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/qpcr")
def qpcr(req: QpcrRequest) -> dict:
    """Synthetic qPCR amplification curves (Ct vs starting copies)."""
    try:
        return core.qpcr(req.copy_estimates)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gel")
def gel(req: GelRequest) -> dict:
    """Predicted gel electrophoresis band pattern."""
    try:
        frags = [{"name": f.name, "length": f.length} for f in req.fragments]
        return core.gel(frags)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
