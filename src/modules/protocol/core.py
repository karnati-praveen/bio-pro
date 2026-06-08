"""Wet-lab protocol generation.

Wraps the Gibson and Golden Gate generators (modules.assembly), adds a BioBrick
(RFC[10]) protocol, and enriches any protocol with a materials list, estimated
hands-on time, and an estimated reagent cost (approximate NEB catalog prices).
"""

from __future__ import annotations

from modules.assembly import gibson_protocol, golden_gate_protocol
from modules.parts import library
from modules.primers.core import design_primers
from modules.export.records import BIOBRICK_PREFIX, BIOBRICK_SUFFIX
from shared.schemas.schemas import AssemblyFragment, AssemblyProtocol, CompileResponse

# Approximate NEB catalogue (item → (catalog #, unit cost USD)).
_CATALOG = {
    "EcoRI-HF": ("R3101", 62.0), "SpeI-HF": ("R3133", 62.0), "XbaI": ("R0145", 62.0),
    "PstI-HF": ("R3140", 62.0), "BsaI-HFv2": ("R3733", 68.0), "DpnI": ("R0176", 62.0),
    "T4 DNA Ligase": ("M0202", 65.0), "T4 DNA Ligase Buffer": ("B0202", 0.0),
    "NEBuilder HiFi Master Mix": ("E2621", 256.0), "Q5 Polymerase": ("M0491", 125.0),
    "Gel Extraction Kit": ("T1020", 95.0), "Competent E. coli (DH5α)": ("C2987", 95.0),
    "Antibiotic plates": ("—", 20.0),
}


def _materials(items: list[str]) -> list[dict]:
    out = []
    for it in items:
        cat, cost = _CATALOG.get(it, ("—", 0.0))
        out.append({"item": it, "catalog": cat, "unit_cost": cost})
    return out


def _ordered_unique_parts(response: CompileResponse) -> list[tuple[str, str]]:
    seen, out = set(), []
    for tu in response.circuit.transcription_units:
        for pid in tu.parts:
            if pid in seen:
                continue
            seen.add(pid)
            out.append((pid, (library.get_part(pid) or {}).get("seq") or ""))
    return out


def biobrick_protocol(response: CompileResponse) -> AssemblyProtocol:
    """Standard BioBrick (RFC[10]) prefix/suffix ligation assembly."""
    parts = _ordered_unique_parts(response)
    fragments = [
        AssemblyFragment(name=pid, sequence=seq, length=len(seq),
                         order_sequence=BIOBRICK_PREFIX + seq + BIOBRICK_SUFFIX)
        for pid, seq in parts
    ]
    steps = [
        "1. Digest upstream part (vector) with EcoRI-HF + SpeI-HF (37°C, 1 h).",
        "2. Digest downstream part (insert) with EcoRI-HF + XbaI (37°C, 1 h).",
        "3. Gel-extract the cut backbone and insert fragments.",
        "4. Ligate insert into backbone with T4 DNA Ligase (16°C, overnight). "
        "Note: SpeI and XbaI leave compatible overhangs that ligate into a mixed "
        "site (scar) that neither enzyme can re-cut.",
        "5. Transform 2 µL ligation into competent E. coli; plate on selective antibiotic.",
        "6. Pick colonies, miniprep, and verify by diagnostic digest + sequencing.",
    ]
    notes = [
        "BioBrick RFC[10] leaves an 8 bp scar between parts.",
        "Ensure parts are free of internal EcoRI/XbaI/SpeI/PstI sites.",
    ]
    return AssemblyProtocol(method="biobrick", fragments=fragments, steps=steps, notes=notes)


def _design_primers_for(fragments: list[AssemblyFragment]) -> list[dict]:
    primers: list[dict] = []
    for frag in fragments:
        seq = frag.order_sequence or frag.sequence
        if len(seq) < 40:
            continue
        try:
            pair = design_primers(seq, target_tm=60)
        except ValueError:
            continue
        for p in pair:
            primers.append({
                "name": f"{frag.name}_{p['name'][:3]}",
                "sequence": p["sequence"], "length": p["length"],
                "tm": p["tm"], "gc": p["gc"], "amplicon_size": p.get("amplicon_size"),
            })
    return primers


# Per-method enrichment data: (material items, est hands-on minutes).
_METHOD_META = {
    "gibson": (
        ["Q5 Polymerase", "DpnI", "Gel Extraction Kit", "NEBuilder HiFi Master Mix",
         "Competent E. coli (DH5α)", "Antibiotic plates"], 240),
    "golden_gate": (
        ["BsaI-HFv2", "T4 DNA Ligase", "T4 DNA Ligase Buffer",
         "Competent E. coli (DH5α)", "Antibiotic plates"], 150),
    "biobrick": (
        ["EcoRI-HF", "SpeI-HF", "XbaI", "PstI-HF", "T4 DNA Ligase",
         "Gel Extraction Kit", "Competent E. coli (DH5α)", "Antibiotic plates"], 600),
}


def build_protocol(response: CompileResponse, method: str) -> AssemblyProtocol:
    """Generate and enrich a protocol for the chosen assembly method."""
    if method == "gibson":
        proto = gibson_protocol(response)
    elif method == "golden_gate":
        proto = golden_gate_protocol(response)
    elif method == "biobrick":
        proto = biobrick_protocol(response)
    else:
        raise ValueError(f"Unknown assembly method '{method}'.")

    items, base_time = _METHOD_META[method]
    proto.materials = _materials(items)
    proto.est_cost_usd = round(sum(m["unit_cost"] for m in proto.materials), 2)
    proto.est_time_min = base_time + 30 * len(proto.fragments)
    if method in ("gibson", "golden_gate"):
        proto.primers = _design_primers_for(proto.fragments)
    return proto
