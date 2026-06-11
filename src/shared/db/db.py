"""SQLAlchemy engine/session setup for the designs store.

A single local SQLite file. ``DESIGNS_DB`` overrides the path (the test-suite points it
at a temp file). ``init_db`` creates the schema on startup and runs lightweight column
migrations so that existing databases gain new columns without data loss.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_DEFAULT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "designs.db"
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
    """Create tables, run column migrations, and seed the parts library (idempotent)."""
    from shared.db import models  # noqa: F401 -- register mappers before create_all

    Base.metadata.create_all(engine)
    _migrate_columns()
    _seed_parts()


def _migrate_columns() -> None:
    """Add new columns to existing tables that pre-date the current schema.

    SQLite's ALTER TABLE only supports adding nullable columns, which is exactly what
    we need. We check PRAGMA table_info first so the migration is idempotent.
    """
    migrations: list[tuple[str, str, str]] = [
        # (table, column, type)
        ("designs",          "project_id",        "INTEGER"),
        ("simulation_runs",  "project_id",        "INTEGER"),
        ("experiments",      "project_id",        "INTEGER"),
        ("experiments",      "design_version_no", "INTEGER"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            existing = {row[1] for row in rows}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        conn.commit()


def _seed_parts() -> None:
    """Upsert parts from seed data — adds new parts and updates existing ones."""
    from shared.db.models import Part
    from modules.parts.seed_parts import PARTS

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
