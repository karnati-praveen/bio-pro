"""MCP server for the Biological Compiler.

Exposes the full compiler pipeline (parse → assemble → validate → simulate)
plus the design library and export functions as MCP tools and resources.

Run with:
    cd backend && python mcp_server.py          # stdio transport (Claude Desktop / Claude Code)

Or configure .mcp.json at the project root to let Claude Code auto-discover it.

The server re-uses all existing backend modules directly; no HTTP proxy involved.
"""

import json
import os
import sys
from typing import Literal, Optional

# Ensure backend modules are importable when the server is launched from the project root.
sys.path.insert(0, os.path.dirname(__file__))

from mcp.server.fastmcp import FastMCP

from modules.compiler import assembler, llm_parser, parser, validate
from modules.compiler.assembler import AssemblyError
from modules.compiler.parser import ParseError
from modules.parts import library
from shared.schemas.schemas import (
    CompileResponse,
    FormInput,
    IntentSpec,
    SimParams,
)
from modules.simulation import ode
from shared.db import repo
from shared.db.db import init_db
from modules import export as export_module

init_db()

mcp = FastMCP(
    "Biological Compiler",
    instructions=(
        "This server exposes the Biological Compiler: a synthetic-biology IDE that converts "
        "plain-English goals into genetic circuits, ODE simulations, and standard export formats.\n\n"
        "Typical workflow:\n"
        "1. Call list_parts to see what reporters (GFP/RFP/YFP/mCherry/BFP/luciferase) and inducers "
        "(IPTG/aTc/arabinose/AHL/rhamnose/vanillic_acid/doxycycline/galactose) are available.\n"
        "2. Call compile_circuit with a free-text goal OR structured form fields.\n"
        "3. Inspect the returned spec, circuit (nodes + edges), validation findings, and simulation "
        "time series.\n"
        "4. Optionally call save_design to persist the result, or export_circuit for a GenBank/FASTA "
        "file.\n"
        "5. Sweep kinetic parameters with simulate_circuit to explore the circuit's behaviour."
    ),
)


# ---------------------------------------------------------------------------
# Parts library tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_parts() -> dict:
    """Return the complete genetic parts library.

    Includes all characterized parts (promoters, CDS reporters/repressors/activators,
    RBS, terminators, inducers, insulators, degradation tags) plus convenience lists
    of reporter ids and inducer ids for use in compile_circuit.
    """
    return {
        "parts": library.all_parts(),
        "reporters": [p["id"] for p in library.reporters()],
        "inducers": [p["id"] for p in library.inducers()],
    }


@mcp.tool()
def get_part(part_id: str) -> dict:
    """Return the full record for a single genetic part.

    Args:
        part_id: Canonical part id, e.g. 'GFP', 'IPTG', 'pLac', 'LacI', 'B0034'.

    Returns the part dict (id, name, type, role, description, color, sequence, …),
    or an error key if the part is not in the library.
    """
    part = library.get_part(part_id)
    if part is None:
        return {"error": f"Part '{part_id}' not found. Use list_parts to see available ids."}
    return part


# ---------------------------------------------------------------------------
# Core compiler tool
# ---------------------------------------------------------------------------


@mcp.tool()
def compile_circuit(
    text: Optional[str] = None,
    output: Optional[str] = None,
    inducer: Optional[str] = None,
    presence: Literal["present", "absent"] = "present",
    inducer2: Optional[str] = None,
    gate: Optional[Literal["and", "or"]] = None,
    beta_p: Optional[float] = None,
    gamma_p: Optional[float] = None,
    k: Optional[float] = None,
    n: Optional[float] = None,
    i_max: Optional[float] = None,
) -> dict:
    """Compile a biological goal into a genetic circuit with ODE simulation.

    Provide EITHER:
      text — free natural language, e.g. "Express GFP when IPTG is present"
              (uses the LLM parser if ANTHROPIC_API_KEY is set, else regex)
    OR structured form fields:
      output   — reporter id: 'GFP', 'RFP', or 'YFP'
      inducer  — primary inducer id: 'IPTG', 'aTc', or 'arabinose'
      presence — 'present' (default) or 'absent' (reporter ON when inducer NOT added)
      inducer2 — second inducer id for a two-input logic circuit
      gate     — 'and' or 'or' (required when inducer2 is set)

    Optional kinetic parameter overrides (all in arbitrary units):
      beta_p  — max reporter production rate (default 10.0)
      gamma_p — reporter degradation rate (default 0.08)
      k       — Hill half-max constant (default 10.0)
      n       — Hill coefficient / cooperativity (default 2)
      i_max   — inducer level once switched on (default 5.0)

    Returns a dict with keys: spec, circuit, validation, simulation, trace.
    On parse/assembly error returns {'error': '...'}.
    """
    try:
        params: Optional[SimParams] = None
        if any(v is not None for v in (beta_p, gamma_p, k, n, i_max)):
            params = SimParams(beta_p=beta_p, gamma_p=gamma_p, k=k, n=n, i_max=i_max)

        # --- Parse stage ---
        if text:
            raw = text.strip()
            if llm_parser.is_enabled():
                try:
                    spec = llm_parser.parse_text_llm(raw)
                except ParseError:
                    raise
                except Exception:
                    spec = parser.parse_text(raw)
            else:
                spec = parser.parse_text(raw)
        elif output and inducer:
            form = FormInput(
                output=output,
                inducer=inducer,
                presence=presence,
                inducer2=inducer2 if gate else None,
                gate=gate,
            )
            spec = parser.parse_form(form)
        else:
            return {"error": "Provide either 'text' or both 'output' and 'inducer'."}

        circuit = assembler.assemble(spec)
        validation = validate.validate(spec, circuit)
        simulation = ode.simulate(spec, params)
        trace = [*spec.trace, *circuit.trace]

        response = CompileResponse(
            spec=spec,
            circuit=circuit,
            validation=validation,
            simulation=simulation,
            trace=trace,
        )
        return response.model_dump()

    except (ParseError, AssemblyError) as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Unexpected error: {exc}"}


# ---------------------------------------------------------------------------
# Simulation-only tool (parameter sweep)
# ---------------------------------------------------------------------------


@mcp.tool()
def simulate_circuit(
    output: str,
    inducer: str,
    presence: Literal["present", "absent"] = "present",
    inducer2: Optional[str] = None,
    gate: Optional[Literal["and", "or"]] = None,
    beta_p: Optional[float] = None,
    gamma_p: Optional[float] = None,
    k: Optional[float] = None,
    n: Optional[float] = None,
    i_max: Optional[float] = None,
) -> dict:
    """Run only the ODE simulation for a circuit (skips assembly and validation).

    Useful for sweeping kinetic parameters (beta_p, gamma_p, k, n, i_max) over a
    fixed circuit topology without re-running the full compile_circuit pipeline.

    Args:
        output:   Reporter id ('GFP', 'RFP', 'YFP').
        inducer:  Primary inducer id ('IPTG', 'aTc', 'arabinose').
        presence: 'present' or 'absent'.
        inducer2: Second inducer for a two-input gate.
        gate:     'and' or 'or'.
        beta_p, gamma_p, k, n, i_max: kinetic parameter overrides.

    Returns a Simulation dict with keys 't' (time array) and 'series' (concentration traces).
    """
    try:
        form = FormInput(
            output=output,
            inducer=inducer,
            presence=presence,
            inducer2=inducer2 if gate else None,
            gate=gate,
        )
        spec = parser.parse_form(form)

        params: Optional[SimParams] = None
        if any(v is not None for v in (beta_p, gamma_p, k, n, i_max)):
            params = SimParams(beta_p=beta_p, gamma_p=gamma_p, k=k, n=n, i_max=i_max)

        simulation = ode.simulate(spec, params)
        return simulation.model_dump()
    except (ParseError, ValueError) as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Export tool
# ---------------------------------------------------------------------------


@mcp.tool()
def export_circuit(
    compile_result: dict,
    format: Literal["genbank", "fasta", "sbol", "json"] = "genbank",
) -> dict:
    """Export a compiled circuit to a standard bioinformatics format.

    Args:
        compile_result: The dict returned by compile_circuit.
        format: One of:
            'genbank' — annotated GenBank flat file (.gb) with transcription units
            'fasta'   — FASTA file with part sequences
            'sbol'    — SBOL3 XML structural design file
            'json'    — self-contained JSON bundle (spec + circuit + simulation)

    Returns {'text': '...', 'format': '...', 'media_type': '...', 'filename': '...'}.
    On error returns {'error': '...'}.
    """
    try:
        response = CompileResponse.model_validate(compile_result)
        text, media_type, suffix = export_module.export(response, format)
        return {
            "text": text,
            "format": format,
            "media_type": media_type,
            "filename": f"design.{suffix}",
        }
    except ValueError as exc:
        return {"error": str(exc)}
    except RuntimeError as exc:
        return {"error": f"Optional dependency missing: {exc}"}
    except Exception as exc:
        return {"error": f"Export failed: {exc}"}


# ---------------------------------------------------------------------------
# Design persistence tools
# ---------------------------------------------------------------------------


@mcp.tool()
def save_design(
    name: str,
    compile_result: dict,
    compile_request: dict,
    owner_email: str = "",
) -> dict:
    """Save a compiled circuit as a named, versioned design.

    Args:
        name:            Human-readable design name (e.g. 'GFP toggle v1').
        compile_result:  The dict returned by compile_circuit.
        compile_request: The original request dict (text or form fields) that produced the result.
        owner_email:     Optional owner email address for filtering.

    Returns a summary dict with the design id and metadata.
    On error returns {'error': '...'}.
    """
    try:
        return repo.create_design(name, compile_request, compile_result, owner_email=owner_email)
    except Exception as exc:
        return {"error": str(exc)}


@mcp.tool()
def add_design_version(
    design_id: int,
    compile_result: dict,
    compile_request: dict,
) -> dict:
    """Append a new version to an existing saved design.

    Args:
        design_id:       Id returned by save_design.
        compile_result:  The new compile_circuit result dict.
        compile_request: The request dict that produced the new result.

    Returns {'design_id': ..., 'version_no': ...} on success.
    """
    result = repo.add_version(design_id, compile_request, compile_result)
    if result is None:
        return {"error": f"Design {design_id} not found."}
    return result


@mcp.tool()
def list_designs(owner_email: Optional[str] = None) -> list:
    """List all saved designs, newest first.

    Args:
        owner_email: If provided, return only designs owned by this email address.

    Returns a list of design summary dicts (id, name, owner_email, created_at, latest_version).
    """
    return repo.list_designs(owner_email=owner_email)


@mcp.tool()
def get_design(design_id: int) -> dict:
    """Return a saved design including its full version history.

    Args:
        design_id: Design id returned by save_design or list_designs.

    Returns the design summary plus a 'versions' list with version_no and created_at.
    """
    design = repo.get_design(design_id)
    if design is None:
        return {"error": f"Design {design_id} not found."}
    return design


@mcp.tool()
def get_design_version(design_id: int, version_no: int) -> dict:
    """Return the full circuit and simulation data for a specific design version.

    Args:
        design_id:  Design id.
        version_no: Version number (1-based).

    Returns {'design_id', 'version_no', 'created_at', 'request', 'response'} where
    'response' contains the full CompileResponse (spec, circuit, simulation, …).
    """
    version = repo.get_version(design_id, version_no)
    if version is None:
        return {"error": f"Version {version_no} of design {design_id} not found."}
    return version


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------


@mcp.resource("parts://library")
def parts_library_resource() -> str:
    """The live genetic parts catalog: all 15 parts with sequences, roles, and descriptions."""
    return json.dumps(
        {
            "parts": library.all_parts(),
            "reporters": [p["id"] for p in library.reporters()],
            "inducers": [p["id"] for p in library.inducers()],
        },
        indent=2,
    )


@mcp.resource("designs://list")
def designs_list_resource() -> str:
    """Current list of all saved designs (newest first)."""
    return json.dumps(repo.list_designs(), indent=2)


@mcp.resource("designs://{design_id}")
def design_resource(design_id: str) -> str:
    """Full design record including version history.

    Args:
        design_id: Numeric design id (as a string in the URI, e.g. designs://1).
    """
    try:
        did = int(design_id)
    except ValueError:
        return json.dumps({"error": f"Invalid design id '{design_id}'."})
    design = repo.get_design(did)
    if design is None:
        return json.dumps({"error": f"Design {did} not found."})
    return json.dumps(design, indent=2)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


@mcp.prompt()
def design_a_circuit(goal: str = "") -> str:
    """A guided prompt for designing a genetic circuit from a biological goal.

    Args:
        goal: Optional plain-English description of the desired circuit behaviour.
    """
    catalog = (
        "Reporters: GFP (green), RFP (red), YFP (yellow)\n"
        "Inducers:  IPTG (derepresses pLac/LacI), aTc (derepresses pTet/TetR), "
        "arabinose (activates pBAD/AraC)\n"
        "Patterns:  inducible_expression (1 inducer), logic_and / logic_or (2 inducers)"
    )
    goal_line = f"User goal: {goal}\n\n" if goal else ""
    return (
        f"{goal_line}"
        "You are helping design a synthetic-biology genetic circuit.\n\n"
        f"Available parts:\n{catalog}\n\n"
        "Steps:\n"
        "1. Identify the reporter and inducer(s) from the goal.\n"
        "2. Call compile_circuit with the appropriate text or form fields.\n"
        "3. Check validation.ok and validation.findings in the result.\n"
        "4. Summarise the circuit topology (nodes, edges, transcription units) "
        "and the simulated expression curve.\n"
        "5. If the user wants to save the design, call save_design.\n"
        "6. If the user wants a sequence file, call export_circuit with the desired format."
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
