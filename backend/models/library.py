"""Genetic parts library — SQLite-backed, with backward-compatible dict interface.

All query functions return plain dicts so the rest of the compiler continues to use
``part["id"]``, ``part["type"]``, ``part["seq"]`` etc. without modification.
The ``to_dict()`` method on the Part ORM model handles the mapping.
"""

from typing import Optional

from storage.db import SessionLocal
from storage.models import Part


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
