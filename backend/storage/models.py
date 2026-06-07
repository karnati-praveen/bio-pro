"""ORM models: Parts catalogue, Designs, and DesignVersions.

Each version stores the full compile request *and* response JSON, so a saved design is
fully reproducible (and exportable) without recompiling.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from storage.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Part(Base):
    """A characterized genetic part with kinetic parameters and host compatibility."""

    __tablename__ = "parts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)          # short compiler id
    biobrick_id: Mapped[str] = mapped_column(String(64), nullable=True)    # BBa_XXXXXX
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)          # promoter/cds/rbs/terminator/inducer
    role: Mapped[str] = mapped_column(String(32), nullable=True)           # reporter/repressor/activator/constitutive/null
    regulator: Mapped[str] = mapped_column(String(64), nullable=True)
    inducer: Mapped[str] = mapped_column(String(64), nullable=True)
    induction_mode: Mapped[str] = mapped_column(String(32), nullable=True) # derepress/activate
    strength: Mapped[float] = mapped_column(Float, default=1.0)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(16), nullable=True)
    sbol_glyph: Mapped[str] = mapped_column(String(32), nullable=True)
    seq: Mapped[str] = mapped_column(Text, nullable=True)                  # DNA sequence (ATGC)
    host_compatibility: Mapped[list] = mapped_column(JSON, default=list)   # ["ecoli","yeast","mammalian"]
    kinetic_parameters: Mapped[dict] = mapped_column(JSON, default=dict)   # type-specific kinetic params
    source_doi: Mapped[str] = mapped_column(String(256), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "part_id": self.biobrick_id or self.id,
            "biobrick_id": self.biobrick_id,
            "name": self.name,
            "type": self.type,
            "role": self.role,
            "regulator": self.regulator,
            "inducer": self.inducer,
            "induction_mode": self.induction_mode,
            "strength": self.strength,
            "description": self.description,
            "color": self.color,
            "sbol_glyph": self.sbol_glyph,
            "seq": self.seq,
            "sequence": self.seq,
            "host_compatibility": self.host_compatibility or ["ecoli"],
            "kinetic_parameters": self.kinetic_parameters or {},
            "source_doi": self.source_doi,
        }


class Design(Base):
    __tablename__ = "designs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    versions: Mapped[list["DesignVersion"]] = relationship(
        back_populates="design",
        order_by="DesignVersion.version_no",
        cascade="all, delete-orphan",
    )


class SimulationRun(Base):
    """A saved simulation run: parameters used + a results summary, for the history view."""

    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    design_id: Mapped[int] = mapped_column(Integer, nullable=True)
    label: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    mode: Mapped[str] = mapped_column(String(32), default="ode")  # ode/stochastic/sweep/sensitivity
    organism: Mapped[str] = mapped_column(String(32), nullable=True)
    params_json: Mapped[dict] = mapped_column(JSON, default=dict)
    summary_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "design_id": self.design_id,
            "label": self.label,
            "mode": self.mode,
            "organism": self.organism,
            "params": self.params_json or {},
            "summary": self.summary_json or {},
            "created_at": self.created_at.isoformat(),
        }


class DesignVersion(Base):
    __tablename__ = "design_versions"
    __table_args__ = (UniqueConstraint("design_id", "version_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    request_json: Mapped[str] = mapped_column(Text, nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)

    design: Mapped["Design"] = relationship(back_populates="versions")
