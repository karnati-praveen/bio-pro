"""SQLAlchemy engine/session setup for the designs store.

A single local SQLite file. ``DESIGNS_DB`` overrides the path (the test-suite points it
at a temp file). ``init_db`` creates the schema on startup.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "designs.db"
_DB_PATH = os.environ.get("DESIGNS_DB", str(_DEFAULT_PATH))

engine = create_engine(
    f"sqlite:///{_DB_PATH}",
    connect_args={"check_same_thread": False},  # FastAPI may touch it from threads
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create tables and seed the parts library if empty (idempotent)."""
    from storage import models  # noqa: F401 -- register mappers before create_all

    Base.metadata.create_all(engine)
    _seed_parts()


def _seed_parts() -> None:
    """Upsert parts from seed data — adds new parts and updates existing ones."""
    from storage.models import Part
    from data.seed_parts import PARTS

    with SessionLocal() as session:
        for data in PARTS:
            part = session.query(Part).filter(Part.id == data["id"]).first()
            if part is None:
                part = Part(id=data["id"])
                session.add(part)
            part.biobrick_id        = data.get("biobrick_id")
            part.name               = data["name"]
            part.type               = data["type"]
            part.role               = data.get("role")
            part.regulator          = data.get("regulator")
            part.inducer            = data.get("inducer")
            part.induction_mode     = data.get("induction_mode")
            part.strength           = data.get("strength", 1.0)
            part.description        = data.get("description")
            part.color              = data.get("color")
            part.sbol_glyph         = data.get("sbol_glyph")
            part.seq                = data.get("seq")
            part.host_compatibility = data.get("host_compatibility", ["ecoli"])
            part.kinetic_parameters = data.get("kinetic_parameters", {})
            part.source_doi         = data.get("source_doi")
        session.commit()
