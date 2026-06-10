"""Thin CRUD over Projects, Designs, DesignVersions, SimulationRuns, Experiments, etc.

Each function opens and closes its own session, so callers (FastAPI endpoints) don't
manage transactions. Request/response payloads are stored as JSON strings.
"""

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from shared.db.db import SessionLocal
from shared.db.models import (
    Design, DesignVersion, Part, SimulationRun, ChemCache, Experiment,
    Project, SavedOrder,
)


def _next_version_no(session, design_id: int) -> int:
    existing = session.scalars(
        select(DesignVersion.version_no).where(DesignVersion.design_id == design_id)
    ).all()
    return (max(existing) + 1) if existing else 1


def create_design(name: str, request: dict, response: dict, owner_email: str = "",
                  project_id: Optional[int] = None) -> dict:
    """Create a design and its first version. Returns a summary dict."""
    with SessionLocal() as session:
        design = Design(name=name, owner_email=owner_email, project_id=project_id)
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
        stmt = select(Design).options(joinedload(Design.versions)).order_by(Design.updated_at.desc())
        if owner_email:
            stmt = stmt.where(Design.owner_email == owner_email)
        return [_design_summary(d) for d in session.scalars(stmt).unique()]


def get_design(design_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        design = session.scalar(
            select(Design)
            .where(Design.id == design_id)
            .options(joinedload(Design.versions))
        )
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
                        params: dict, summary: dict, design_id: int | None = None,
                        project_id: int | None = None) -> dict:
    with SessionLocal() as session:
        run = SimulationRun(
            label=label, mode=mode, organism=organism,
            params_json=params or {}, summary_json=summary or {},
            design_id=design_id, project_id=project_id,
        )
        session.add(run)
        session.commit()
        return run.to_dict()


def list_simulation_runs(limit: int = 50) -> list[dict]:
    with SessionLocal() as session:
        stmt = select(SimulationRun).order_by(SimulationRun.created_at.desc()).limit(limit)
        return [r.to_dict() for r in session.scalars(stmt)]


def create_experiment(data: dict) -> dict:
    fields = {k: data[k] for k in
              ("title", "project_id", "design_id", "design_version_no",
               "exp_type", "date", "protocol_ref", "notes_md")
              if k in data}
    fields["columns_json"] = data.get("columns", [])
    fields["rows_json"] = data.get("rows", [])
    with SessionLocal() as session:
        exp = Experiment(**fields)
        session.add(exp)
        session.commit()
        return exp.to_dict()


def update_experiment(exp_id: int, data: dict) -> Optional[dict]:
    with SessionLocal() as session:
        exp = session.get(Experiment, exp_id)
        if exp is None:
            return None
        for k in ("title", "project_id", "design_id", "design_version_no",
                  "exp_type", "date", "protocol_ref", "notes_md"):
            if k in data:
                setattr(exp, k, data[k])
        if "columns" in data:
            exp.columns_json = data["columns"]
        if "rows" in data:
            exp.rows_json = data["rows"]
        session.commit()
        return exp.to_dict()


def list_experiments() -> list[dict]:
    with SessionLocal() as session:
        stmt = select(Experiment).order_by(Experiment.updated_at.desc())
        return [e.to_dict() for e in session.scalars(stmt)]


def get_experiment(exp_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        exp = session.get(Experiment, exp_id)
        return exp.to_dict() if exp else None


def delete_experiment(exp_id: int) -> bool:
    with SessionLocal() as session:
        exp = session.get(Experiment, exp_id)
        if exp is None:
            return False
        session.delete(exp)
        session.commit()
        return True


def get_chem_cache(cache_key: str) -> Optional[dict]:
    with SessionLocal() as session:
        row = session.get(ChemCache, cache_key)
        return row.to_dict() if row else None


def put_chem_cache(cache_key: str, data: dict, cid: int | None = None) -> dict:
    with SessionLocal() as session:
        row = session.get(ChemCache, cache_key)
        if row:
            row.data_json = data
            row.cid = cid
        else:
            session.add(ChemCache(cache_key=cache_key, data_json=data, cid=cid))
        session.commit()
        return data


def get_simulation_run(run_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        run = session.get(SimulationRun, run_id)
        return run.to_dict() if run else None


def _design_summary(design: Design) -> dict:
    reporter_count = 0
    inducer_count = 0
    if design.versions:
        latest = max(design.versions, key=lambda v: v.version_no)
        try:
            response = json.loads(latest.response_json)
            nodes = response.get("circuit", {}).get("nodes", [])
            reporter_count = sum(1 for n in nodes if isinstance(n, dict) and n.get("reporter"))
            inducer_count = sum(1 for n in nodes if isinstance(n, dict) and n.get("type") == "inducer")
        except Exception:
            pass
    return {
        "id": design.id,
        "name": design.name,
        "owner_email": design.owner_email,
        "project_id": design.project_id,
        "created_at": design.created_at.isoformat(),
        "updated_at": design.updated_at.isoformat(),
        "latest_version": max((v.version_no for v in design.versions), default=0),
        "reporter_count": reporter_count,
        "inducer_count": inducer_count,
    }


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

def create_project(name: str, owner_email: str = "", description: str = "") -> dict:
    with SessionLocal() as session:
        p = Project(name=name, owner_email=owner_email, description=description)
        session.add(p)
        session.commit()
        return p.to_dict()


def list_projects(owner_email: Optional[str] = None) -> list[dict]:
    with SessionLocal() as session:
        stmt = select(Project).order_by(Project.updated_at.desc())
        if owner_email:
            stmt = stmt.where(Project.owner_email == owner_email)
        return [p.to_dict() for p in session.scalars(stmt)]


def get_project(project_id: int) -> Optional[dict]:
    with SessionLocal() as session:
        p = session.get(Project, project_id)
        if p is None:
            return None
        data = p.to_dict()
        designs = session.scalars(
            select(Design).options(joinedload(Design.versions))
            .where(Design.project_id == project_id)
        ).unique().all()
        sims = session.scalars(
            select(SimulationRun).where(SimulationRun.project_id == project_id)
            .order_by(SimulationRun.created_at.desc())
        ).all()
        exps = session.scalars(
            select(Experiment).where(Experiment.project_id == project_id)
            .order_by(Experiment.updated_at.desc())
        ).all()
        orders = session.scalars(
            select(SavedOrder).where(SavedOrder.project_id == project_id)
            .order_by(SavedOrder.created_at.desc())
        ).all()
        data["designs"]     = [_design_summary(d) for d in designs]
        data["simulations"] = [r.to_dict() for r in sims]
        data["experiments"] = [e.to_dict() for e in exps]
        data["orders"]      = [o.to_dict() for o in orders]
        return data


def update_project(project_id: int, name: Optional[str] = None,
                   description: Optional[str] = None) -> Optional[dict]:
    with SessionLocal() as session:
        p = session.get(Project, project_id)
        if p is None:
            return None
        if name is not None:
            p.name = name
        if description is not None:
            p.description = description
        session.commit()
        return p.to_dict()


def delete_project(project_id: int) -> bool:
    with SessionLocal() as session:
        p = session.get(Project, project_id)
        if p is None:
            return False
        session.delete(p)
        session.commit()
        return True


# ---------------------------------------------------------------------------
# Artifact attach helpers
# ---------------------------------------------------------------------------

def attach_design_to_project(project_id: int, design_id: int) -> bool:
    with SessionLocal() as session:
        d = session.get(Design, design_id)
        if d is None:
            return False
        d.project_id = project_id
        session.commit()
        return True


def attach_simulation_to_project(project_id: int, sim_id: int) -> bool:
    with SessionLocal() as session:
        r = session.get(SimulationRun, sim_id)
        if r is None:
            return False
        r.project_id = project_id
        session.commit()
        return True


def attach_experiment_to_project(project_id: int, exp_id: int) -> bool:
    with SessionLocal() as session:
        e = session.get(Experiment, exp_id)
        if e is None:
            return False
        e.project_id = project_id
        session.commit()
        return True


# ---------------------------------------------------------------------------
# Saved orders
# ---------------------------------------------------------------------------

def save_order(project_id: Optional[int], design_id: Optional[int], vendor: str,
               fragment_count: int, estimated_cost_usd: float,
               sequences: list) -> dict:
    with SessionLocal() as session:
        o = SavedOrder(
            project_id=project_id, design_id=design_id, vendor=vendor,
            fragment_count=fragment_count, estimated_cost_usd=estimated_cost_usd,
            sequences_json=sequences,
        )
        session.add(o)
        session.commit()
        return o.to_dict()


def list_orders(project_id: Optional[int] = None) -> list[dict]:
    with SessionLocal() as session:
        stmt = select(SavedOrder).order_by(SavedOrder.created_at.desc())
        if project_id is not None:
            stmt = stmt.where(SavedOrder.project_id == project_id)
        return [o.to_dict() for o in session.scalars(stmt)]
