"""Thin CRUD over Designs and DesignVersions.

Each function opens and closes its own session, so callers (FastAPI endpoints) don't
manage transactions. Request/response payloads are stored as JSON strings.
"""

import json
from typing import Optional

from sqlalchemy import select

from storage.db import SessionLocal
from storage.models import Design, DesignVersion, Part, SimulationRun


def _next_version_no(session, design_id: int) -> int:
    existing = session.scalars(
        select(DesignVersion.version_no).where(DesignVersion.design_id == design_id)
    ).all()
    return (max(existing) + 1) if existing else 1


def create_design(name: str, request: dict, response: dict, owner_email: str = "") -> dict:
    """Create a design and its first version. Returns a summary dict."""
    with SessionLocal() as session:
        design = Design(name=name, owner_email=owner_email)
        session.add(design)
        session.flush()  # assign design.id
        version = DesignVersion(
            design_id=design.id,
            version_no=1,
            request_json=json.dumps(request),
            response_json=json.dumps(response),
        )
        session.add(version)
        session.commit()
        return _design_summary(design)


def add_version(design_id: int, request: dict, response: dict) -> Optional[dict]:
    """Append a new version to an existing design. None if the design is missing."""
    with SessionLocal() as session:
        design = session.get(Design, design_id)
        if design is None:
            return None
        version = DesignVersion(
            design_id=design_id,
            version_no=_next_version_no(session, design_id),
            request_json=json.dumps(request),
            response_json=json.dumps(response),
        )
        session.add(version)
        session.commit()
        return {"design_id": design_id, "version_no": version.version_no}


def list_designs(owner_email: Optional[str] = None) -> list[dict]:
    with SessionLocal() as session:
        stmt = select(Design).order_by(Design.updated_at.desc())
        if owner_email:
            stmt = stmt.where(Design.owner_email == owner_email)
        return [_design_summary(d) for d in session.scalars(stmt)]


def get_design(design_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        design = session.get(Design, design_id)
        if design is None:
            return None
        summary = _design_summary(design)
        summary["versions"] = [
            {"version_no": v.version_no, "created_at": v.created_at.isoformat()}
            for v in design.versions
        ]
        return summary


def get_version(design_id: int, version_no: int) -> Optional[dict]:
    """Return the stored request + response for one version."""
    with SessionLocal() as session:
        version = session.scalar(
            select(DesignVersion).where(
                DesignVersion.design_id == design_id,
                DesignVersion.version_no == version_no,
            )
        )
        if version is None:
            return None
        return {
            "design_id": design_id,
            "version_no": version.version_no,
            "created_at": version.created_at.isoformat(),
            "request": json.loads(version.request_json),
            "response": json.loads(version.response_json),
        }


_PART_FIELDS = {
    "id", "biobrick_id", "name", "type", "role", "regulator", "inducer",
    "induction_mode", "strength", "description", "color", "sbol_glyph", "seq",
    "host_compatibility", "kinetic_parameters", "source_doi",
}


def create_part(data: dict) -> dict:
    """Insert (or replace) a custom part. Returns the stored part as a dict."""
    fields = {k: v for k, v in data.items() if k in _PART_FIELDS}
    if not fields.get("id"):
        raise ValueError("Part requires an 'id'.")
    if not fields.get("name"):
        fields["name"] = fields["id"]
    if not fields.get("type"):
        raise ValueError("Part requires a 'type'.")
    fields.setdefault("host_compatibility", ["ecoli"])
    fields.setdefault("kinetic_parameters", {})
    with SessionLocal() as session:
        existing = session.get(Part, fields["id"])
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            part = existing
        else:
            part = Part(**fields)
            session.add(part)
        session.commit()
        return part.to_dict()


def save_simulation_run(label: str, mode: str, organism: str | None,
                        params: dict, summary: dict, design_id: int | None = None) -> dict:
    with SessionLocal() as session:
        run = SimulationRun(
            label=label, mode=mode, organism=organism,
            params_json=params or {}, summary_json=summary or {}, design_id=design_id,
        )
        session.add(run)
        session.commit()
        return run.to_dict()


def list_simulation_runs(limit: int = 50) -> list[dict]:
    with SessionLocal() as session:
        stmt = select(SimulationRun).order_by(SimulationRun.created_at.desc()).limit(limit)
        return [r.to_dict() for r in session.scalars(stmt)]


def get_simulation_run(run_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        run = session.get(SimulationRun, run_id)
        return run.to_dict() if run else None


def _design_summary(design: Design) -> dict:
    return {
        "id": design.id,
        "name": design.name,
        "owner_email": design.owner_email,
        "created_at": design.created_at.isoformat(),
        "updated_at": design.updated_at.isoformat(),
        "latest_version": max((v.version_no for v in design.versions), default=0),
    }
