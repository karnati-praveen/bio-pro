"""FastAPI entrypoint for the Biological Compiler v0.3.0.

Features:
  - 15-pattern compiler (parse → assemble → validate → simulate)
  - Real parts database (SQLite-backed, 50+ characterized parts)
  - Host organism support (E. coli / yeast / mammalian)
  - DNA sequence + SBOL export with BioBrick flanking
  - Parameter sweep / sensitivity analysis
  - Design failure warnings (leakiness, metabolic burden, oscillation risk)
  - Cloning strategy generation (Gibson + Golden Gate)
  - Literature citations via CrossRef API
  - DNA ordering (IDT + Twist)
  - Stochastic simulation (Gillespie algorithm)
"""

import io
import json
from collections import deque
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from modules.parts import library
from shared.schemas.schemas import (
    AssemblyRequest,
    CircuitEdge,
    CircuitNode,
    CompileRequest,
    CompileResponse,
    IntentSpec,
    StochasticRequest,
    SweepRequest,
)
from modules.compiler import assembler, llm_compiler, llm_parser, parser, validate
from modules.compiler.parser import ParseError
from modules.compiler.assembler import AssemblyError
from modules.simulation import ode
from modules.simulation.stochastic import run_stochastic
from shared.db import repo
from shared.db.db import init_db
from modules.citations import api as cit_module
from modules.ordering import api as ord_module
from modules import export
from modules import assembly as asm_module
from modules.sequence import api as sequence_router
from modules.parts import api as parts_router
from modules.simulation import api as simulation_router
from modules.llm import api as llm_router
from modules.sequence import lsp as lsp_router
from modules.chemistry import api as chemistry_router
from modules.primers import api as primers_router
from modules.protocol import api as protocol_router
from modules.pathway import api as pathway_router
from modules.experiments import api as experiments_router
from modules.git import api as git_router
from modules.seqmap import api as seqmap_router
from modules.crispr import api as crispr_router
from modules.codon import api as codon_router
from modules.align import api as align_router
from modules.assays import api as assays_router
from modules.projects import api as projects_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()   # create schema + seed parts on first run
    yield


app = FastAPI(title="Biological Compiler", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",          # Tauri custom protocol (macOS/Linux)
        "http://tauri.localhost",     # WebView2 on Windows
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sequence_router.router)
app.include_router(parts_router.router)
app.include_router(simulation_router.router)
app.include_router(llm_router.router)
app.include_router(lsp_router.router)
app.include_router(chemistry_router.router)
app.include_router(primers_router.router)
app.include_router(protocol_router.router)
app.include_router(pathway_router.router)
app.include_router(experiments_router.router)
app.include_router(git_router.router)
app.include_router(seqmap_router.router)
app.include_router(codon_router.router)
app.include_router(crispr_router.router)
app.include_router(align_router.router)
app.include_router(assays_router.router)
app.include_router(projects_router.router)


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
def _parse(req: CompileRequest) -> IntentSpec:
    if req.form:
        return parser.parse_form(req.form, organism=req.organism)
    text = req.text or ""
    if llm_parser.is_enabled():
        try:
            return llm_parser.parse_text_llm(text)
        except ParseError:
            raise
        except Exception:
            return parser.parse_text(text, organism=req.organism)
    return parser.parse_text(text, organism=req.organism)


def _compile_full(req: CompileRequest) -> CompileResponse:
    spec = _parse(req)
    circuit = assembler.assemble(spec)
    validation = validate.validate(spec, circuit)
    simulation = ode.simulate(spec, req.params)
    citations = cit_module.collect_citations(
        CompileResponse(
            spec=spec, circuit=circuit, validation=validation,
            simulation=simulation, trace=[],
        )
    )
    trace = [*spec.trace, *circuit.trace]
    return CompileResponse(
        spec=spec,
        circuit=circuit,
        validation=validation,
        simulation=simulation,
        trace=trace,
        citations=citations,
        organism=req.organism,
    )


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "llm_parser": llm_parser.is_enabled(), "version": "0.3.0"}


# --------------------------------------------------------------------------- #
# Lint — fast parse+validate without ODE simulation, used by Monaco editor    #
# --------------------------------------------------------------------------- #
class LintRequest(BaseModel):
    text: str
    organism: Optional[str] = None


@app.post("/api/lint")
def lint_circuit(req: LintRequest) -> dict:
    """Parse and validate a .biopro goal string without running the ODE simulation.
    Called on debounced keystroke from the Monaco editor (~1 ms round-trip)."""
    try:
        spec    = parser.parse_text(req.text, organism=req.organism)
        circuit = assembler.assemble(spec)
        result  = validate.validate(spec, circuit)
        return {
            "ok": result.ok,
            "findings": [
                {
                    "code":     f.code,
                    "severity": f.severity,
                    "message":  f.message,
                    "target":   getattr(f, "target", None),
                }
                for f in result.findings
            ],
        }
    except ParseError as exc:
        return {
            "ok": False,
            "findings": [{"code": "parse_error", "severity": "error", "message": str(exc), "target": None}],
        }
    except AssemblyError as exc:
        return {
            "ok": False,
            "findings": [{"code": "assembly_error", "severity": "error", "message": str(exc), "target": None}],
        }


# --------------------------------------------------------------------------- #
# Parts library (Feature 1)
# --------------------------------------------------------------------------- #
@app.get("/api/parts")
def get_parts(
    host: Optional[str] = Query(None, description="Filter by host: ecoli, yeast, mammalian"),
    type: Optional[str] = Query(None, description="Filter by type: promoter, cds, rbs, terminator, inducer"),
) -> dict:
    """Parts library with optional host/type filtering. Includes kinetic parameters."""
    parts = library.all_parts(host=host, type_filter=type)
    reporters = [p["id"] for p in library.reporters()]
    inducers_list = [p["id"] for p in library.inducers()]
    if host:
        reporters = [p["id"] for p in library.all_parts(host=host) if p.get("role") == "reporter"]
        inducers_list = [p["id"] for p in library.all_parts(host=host) if p.get("type") == "inducer"]
    return {"parts": parts, "reporters": reporters, "inducers": inducers_list}


@app.get("/api/parts/{part_id}")
def get_part(part_id: str) -> dict:
    """Get a single part by its short id or BioBrick registry id."""
    part = library.get_part(part_id)
    if part is None:
        raise HTTPException(status_code=404, detail=f"Part '{part_id}' not found.")
    return part


# --------------------------------------------------------------------------- #
# Compile (Features 1–6 integrated + optional LLM layer)
# --------------------------------------------------------------------------- #
@app.post("/api/compile", response_model=CompileResponse)
async def compile_circuit(req: CompileRequest) -> CompileResponse:
    if req.llm_config is not None:
        # LLM-powered path — may raise ParseError with "ambiguous_goal:" prefix
        try:
            return await llm_compiler.compile_with_llm(req, fallback_to_rules=True)
        except ParseError as exc:
            msg = str(exc)
            if msg.startswith("ambiguous_goal:"):
                # Signal the frontend to show the suggestions dialog
                raise HTTPException(
                    status_code=422,
                    detail={"type": "ambiguous_goal", "message": msg[len("ambiguous_goal:"):].strip()},
                ) from exc
            raise HTTPException(status_code=400, detail=msg) from exc
        except AssemblyError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Rule-based path (unchanged)
    try:
        return _compile_full(req)
    except (ParseError, AssemblyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Parameter sweep (Feature 5)
# --------------------------------------------------------------------------- #
@app.post("/api/simulate/sweep")
def parameter_sweep(req: SweepRequest) -> dict:
    """Sweep one kinetic parameter and return all reporter curves with sensitivity scores."""
    try:
        result = ode.sweep(req)
        return result.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Stochastic simulation (Feature 10)
# --------------------------------------------------------------------------- #
@app.post("/api/simulate/stochastic")
def stochastic_sim(req: StochasticRequest) -> dict:
    """Gillespie SSA stochastic simulation: returns mean, p10/p90 bands, and noise index."""
    try:
        result = run_stochastic(req)
        return result.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Cloning strategy (Feature 7)
# --------------------------------------------------------------------------- #
@app.post("/api/assembly")
def generate_assembly(req: AssemblyRequest) -> dict:
    """Generate a step-by-step physical assembly protocol (Gibson or Golden Gate)."""
    try:
        if req.method == "gibson":
            protocol = asm_module.gibson_protocol(req.compile_result)
        else:
            protocol = asm_module.golden_gate_protocol(req.compile_result)
        return protocol.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/assembly/pdf")
def assembly_pdf(req: AssemblyRequest) -> Response:
    """Generate assembly protocol as a PDF (requires reportlab)."""
    try:
        if req.method == "gibson":
            protocol = asm_module.gibson_protocol(req.compile_result)
        else:
            protocol = asm_module.golden_gate_protocol(req.compile_result)

        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import inch

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=letter)
            styles = getSampleStyleSheet()
            story = []

            story.append(Paragraph(f"{protocol.method.upper()} Assembly Protocol", styles["Title"]))
            story.append(Spacer(1, 0.2 * inch))
            story.append(Paragraph("Protocol Steps", styles["Heading2"]))
            for step in protocol.steps:
                story.append(Paragraph(step, styles["Normal"]))
            story.append(Spacer(1, 0.2 * inch))
            story.append(Paragraph("Parts / Fragments", styles["Heading2"]))
            for frag in protocol.fragments:
                story.append(Paragraph(
                    f"<b>{frag.name}</b> ({frag.length} bp)", styles["Normal"]
                ))
            if protocol.notes:
                story.append(Spacer(1, 0.2 * inch))
                story.append(Paragraph("Notes", styles["Heading2"]))
                for note in protocol.notes:
                    story.append(Paragraph(note, styles["Normal"]))
            doc.build(story)
            pdf_bytes = buf.getvalue()

        except ImportError:
            # reportlab not available: return a plain text protocol instead
            lines = [f"# {protocol.method.upper()} Assembly Protocol\n"]
            lines += ["\n## Steps"] + protocol.steps
            lines += ["\n## Fragments"] + [
                f"- {f.name}: {f.length} bp" for f in protocol.fragments
            ]
            if protocol.notes:
                lines += ["\n## Notes"] + protocol.notes
            pdf_bytes = "\n".join(lines).encode("utf-8")
            return Response(
                content=pdf_bytes,
                media_type="text/plain",
                headers={"Content-Disposition": 'attachment; filename="assembly_protocol.txt"'},
            )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="assembly_protocol.pdf"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# DNA ordering (Feature 9)
# --------------------------------------------------------------------------- #
@app.post("/api/order")
def generate_order(response: CompileResponse) -> dict:
    """Generate DNA ordering information for IDT and Twist Bioscience."""
    try:
        orders = ord_module.generate_orders(response)
        return {"orders": orders, "n_fragments": len(orders)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Designs: save / load / version
# --------------------------------------------------------------------------- #
class SaveDesignRequest(BaseModel):
    name: str
    request: dict
    response: dict
    project_id: Optional[int] = None


class AddVersionRequest(BaseModel):
    request: dict
    response: dict


@app.post("/api/designs")
def create_design(
    body: SaveDesignRequest, x_user_email: Optional[str] = Header(default=None)
) -> dict:
    return repo.create_design(
        body.name, body.request, body.response,
        owner_email=x_user_email or "",
        project_id=body.project_id,
    )


@app.post("/api/designs/{design_id}/versions")
def add_version(design_id: int, body: AddVersionRequest) -> dict:
    result = repo.add_version(design_id, body.request, body.response)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Design {design_id} not found.")
    return result


@app.get("/api/designs")
def list_designs(x_user_email: Optional[str] = Header(default=None)) -> list[dict]:
    return repo.list_designs(owner_email=x_user_email or None)


@app.get("/api/designs/{design_id}")
def get_design(design_id: int) -> dict:
    design = repo.get_design(design_id)
    if design is None:
        raise HTTPException(status_code=404, detail=f"Design {design_id} not found.")
    return design


@app.get("/api/designs/{design_id}/versions/{version_no}")
def get_version(design_id: int, version_no: int) -> dict:
    version = repo.get_version(design_id, version_no)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found.")
    return version


@app.get("/api/designs/{design_id}/versions/{a}/diff/{b}")
def diff_versions(design_id: int, a: int, b: int) -> dict:
    """Compare two versions of a design. Returns DSL text for both and a node diff."""
    va = repo.get_version(design_id, a)
    vb = repo.get_version(design_id, b)
    if va is None or vb is None:
        raise HTTPException(status_code=404, detail="Version not found.")

    older, newer = (va, vb) if a <= b else (vb, va)

    older_dsl = (older["request"] or {}).get("text") or ""
    newer_dsl = (newer["request"] or {}).get("text") or ""

    older_nodes = (older["response"] or {}).get("circuit", {}).get("nodes", [])
    newer_nodes = (newer["response"] or {}).get("circuit", {}).get("nodes", [])

    older_map = {n["id"]: n for n in older_nodes if isinstance(n, dict) and "id" in n}
    newer_map = {n["id"]: n for n in newer_nodes if isinstance(n, dict) and "id" in n}

    added   = [n for nid, n in newer_map.items() if nid not in older_map]
    removed = [n for nid, n in older_map.items() if nid not in newer_map]
    changed = [n for nid, n in newer_map.items() if nid in older_map and n != older_map[nid]]

    return {
        "older_dsl": older_dsl,
        "newer_dsl": newer_dsl,
        "node_diff": {"added": added, "removed": removed, "changed": changed},
    }


# --------------------------------------------------------------------------- #
# Export (Feature 2)
# --------------------------------------------------------------------------- #
def _export_response(resp: CompileResponse, fmt: str, base_name: str) -> Response:
    try:
        text, media_type, suffix = export.export(resp, fmt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    filename = f"{base_name}.{suffix}"
    return Response(
        content=text,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/designs/{design_id}/versions/{version_no}/export")
def export_version(design_id: int, version_no: int, format: str = "genbank") -> Response:
    version = repo.get_version(design_id, version_no)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found.")
    resp = CompileResponse.model_validate(version["response"])
    return _export_response(resp, format, f"design{design_id}_v{version_no}")


@app.post("/api/export")
def export_inline(response: CompileResponse, format: str = "genbank") -> Response:
    return _export_response(response, format, "design")


# --------------------------------------------------------------------------- #
# Circuit → DSL (reverse-compile)
# --------------------------------------------------------------------------- #
class CircuitToDslRequest(BaseModel):
    nodes: list[CircuitNode]
    edges: list[CircuitEdge]


def _edge_sign(kind: str) -> int:
    return -1 if kind in ("repression", "inhibition") else 1


def _trace_sign(edges: list[CircuitEdge], start: str, end: str) -> int | None:
    """BFS from start to end; returns net regulatory sign, or None if no path."""
    queue: deque[tuple[str, int]] = deque([(start, 1)])
    visited: set[str] = set()
    while queue:
        node, sign = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        if node == end:
            return sign
        for e in edges:
            if e.source == node and e.target not in visited:
                queue.append((e.target, sign * _edge_sign(e.kind)))
    return None


@app.post("/api/circuit/to-dsl")
def circuit_to_dsl(req: CircuitToDslRequest) -> dict:
    """Convert a ReactFlow circuit graph back into .biopro DSL lines."""
    reporters = [n for n in req.nodes if n.reporter or n.type == "reporter"]
    inducers  = [n for n in req.nodes if n.type == "inducer"]

    lines: list[str] = []
    for rep in reporters:
        rid = rep.id

        # Detect self-feedback: outgoing edge from reporter that loops back.
        feedback: str | None = None
        for e in req.edges:
            if e.source != rid:
                continue
            other = [x for x in req.edges if not (x.source == rid and x.target == e.target)]
            back = _trace_sign(other, e.target, rid)
            if back is not None:
                feedback = "negative" if _edge_sign(e.kind) * back < 0 else "positive"
                break

        # Collect inducer → reporter effects.
        effects: list[tuple[str, int]] = []
        for ind in inducers:
            sign = _trace_sign(req.edges, ind.id, rid)
            if sign is not None:
                effects.append((ind.id, sign))

        # Detect logic gate type (AND/OR/NAND/NOR) on the path to reporter.
        gate_label: str | None = None
        for n in req.nodes:
            if n.type == "logic" and n.label in ("AND", "OR", "NAND", "NOR"):
                if _trace_sign(req.edges, n.id, rid) is not None:
                    gate_label = n.label
                    break

        if not effects:
            suffix = f" with {feedback} feedback" if feedback else ""
            lines.append(f"express {rid} constitutively{suffix}")
        elif len(effects) == 1:
            iid, sign = effects[0]
            if feedback:
                lines.append(f"express {rid} under {iid} with {feedback} feedback")
            elif sign > 0:
                lines.append(f"express {rid} under {iid}")
            else:
                lines.append(f"express {rid} without {iid}")
        else:
            i1, i2 = effects[0][0], effects[1][0]
            op = "or" if gate_label in ("OR", "NOR") else "and"
            lines.append(f"express {rid} when {i1} {op} {i2}")

    return {"dsl": "\n".join(lines) or "# no circuit to convert"}
