"""Genetic parts library — SQLite-backed, with backward-compatible dict interface.

All query functions return plain dicts so the rest of the compiler continues to use
``part["id"]``, ``part["type"]``, ``part["seq"]`` etc. without modification.
The ``to_dict()`` method on the Part ORM model handles the mapping.
"""

from typing import Optional

from shared.db.db import SessionLocal
from shared.db.models import Part


def _query_all() -> list[dict]:
    with SessionLocal() as session:
        return [p.to_dict() for p in session.query(Part).all()]


def all_parts(host: Optional[str] = None, type_filter: Optional[str] = None) -> list[dict]:
    """Return parts, optionally filtered by host organism and/or type."""
    with SessionLocal() as session:
        q = session.query(Part)
        if type_filter:
            q = q.filter(Part.type == type_filter)
        parts = [p.to_dict() for p in q.all()]
    if host:
        parts = [p for p in parts if host in (p.get("host_compatibility") or [])]
    return parts


def get_part(part_id: str) -> Optional[dict]:
    """Return a single part by short id OR biobrick_id, or None."""
    with SessionLocal() as session:
        part = session.query(Part).filter(Part.id == part_id).first()
        if part is None:
            part = session.query(Part).filter(Part.biobrick_id == part_id).first()
        return part.to_dict() if part else None


def parts_by_type(part_type: str) -> list[dict]:
    with SessionLocal() as session:
        return [p.to_dict() for p in session.query(Part).filter(Part.type == part_type).all()]


def parts_by_role(role: str) -> list[dict]:
    with SessionLocal() as session:
        return [p.to_dict() for p in session.query(Part).filter(Part.role == role).all()]


def reporters() -> list[dict]:
    return parts_by_role("reporter")


def inducers() -> list[dict]:
    return parts_by_type("inducer")


def compatible_parts(host: str) -> list[dict]:
    """Return all parts compatible with a given host organism."""
    return all_parts(host=host)


def promoter_kinetics(promoter_id: str) -> tuple[float, float]:
    """Return (basal_frac, max_expr) for a promoter, with safe defaults.

    basal_frac : fractional leak floor = basal_expression / max_expression, in [0, 1].
                 pBAD=0.10, pLac=0.05, pTet=0.02 — used as the f=0 floor in the ODE.
    max_expr   : max_expression (a.u.) — scales beta_p relative to the global default.

    Defaults when the part is missing or has no kinetic_parameters: (0.0, 1.0).
    """
    part = get_part(promoter_id)
    if part is None:
        return (0.0, 1.0)
    kp = part.get("kinetic_parameters") or {}
    basal = float(kp.get("basal_expression", 0.0))
    max_expr = float(kp.get("max_expression", 1.0))
    if max_expr <= 0:
        max_expr = 1.0
    basal_frac = min(basal / max_expr, 1.0)
    return (basal_frac, max_expr)
