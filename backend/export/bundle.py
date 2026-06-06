"""JSON bundle export: a self-contained, human-readable record of the whole design."""

import json

from models.schemas import CompileResponse


def to_bundle(response: CompileResponse) -> str:
    payload = {
        "format": "bio-pro-design-bundle/v1",
        "spec": response.spec.model_dump(),
        "circuit": response.circuit.model_dump(),
        "validation": response.validation.model_dump(),
        "simulation": response.simulation.model_dump(),
        "trace": response.trace,
    }
    return json.dumps(payload, indent=2)
