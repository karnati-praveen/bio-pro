"""Module 7 — Protocol generator backend (Gibson / Golden Gate / BioBrick).
Module 8 — Cloning map data endpoint.
"""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules import protocol as protocol_mod
from modules.protocol.cloning_map import build_cloning_map
from shared.schemas.schemas import CompileResponse

router = APIRouter(prefix="/api/protocol", tags=["protocol"])


class ProtocolRequest(BaseModel):
    compile_result: CompileResponse
    method: Literal["gibson", "golden_gate", "biobrick"] = "gibson"


class CloningMapRequest(BaseModel):
    compile_result: CompileResponse
    method: Literal["gibson", "golden_gate", "biobrick"] = "gibson"
    topology: Optional[Literal["linear", "circular"]] = "linear"


@router.post("")
def generate(req: ProtocolRequest) -> dict:
    try:
        return protocol_mod.build_protocol(req.compile_result, req.method).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/cloning-map")
def cloning_map(req: CloningMapRequest) -> dict:
    """Return structured cloning-map data: parts, restriction sites, primer sites."""
    try:
        proto = protocol_mod.build_protocol(req.compile_result, req.method)
        return build_cloning_map(req.compile_result, proto, topology=req.topology or "linear")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
