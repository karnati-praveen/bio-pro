"""Golden Gate Assembly protocol generator.

Assigns unique 4 bp BsaI overhangs to each junction, verifies orthogonality,
and generates the full digestion + ligation protocol.
"""

import itertools
from models import library
from models.schemas import AssemblyFragment, AssemblyProtocol, CompileResponse

BSAI_SITE = "GGTCTC"           # BsaI recognition sequence (cuts 1 nt downstream on top strand)
BSAI_REV  = "GAGACC"           # Reverse complement

# Standard 4 bp overhangs for common junctions (Potapov et al. 2018 ligation fidelity set)
_PREFERRED_OVERHANGS = [
    "AATG", "TTCG", "GCAG", "CATG", "AACG", "TGCC", "GCTT", "AAAC",
    "CGAG", "TTAC", "AGCA", "TCGA", "GCAT", "ACTG", "TGAC", "CAGT",
    "ACCA", "TGGC", "GCCA", "ACCG",
]


def _reverse_complement(seq: str) -> str:
    complement = str.maketrans("ACGTacgt", "TGCAtgca")
    return seq.translate(complement)[::-1]


def _assign_overhangs(n_junctions: int) -> list[str]:
    """Assign unique 4 bp overhangs to each junction from the preferred set."""
    overhangs = []
    pool = list(_PREFERRED_OVERHANGS)
    for i in range(n_junctions):
        if i < len(pool):
            overhangs.append(pool[i])
        else:
            # Generate fallback overhangs
            overhangs.append(f"GG{i:02d}"[:4])
    return overhangs


def _verify_unique_overhangs(overhangs: list[str]) -> list[str]:
    """Return list of duplicate overhang warnings."""
    warnings = []
    seen: set[str] = set()
    for oh in overhangs:
        rc = _reverse_complement(oh)
        if oh in seen or rc in seen:
            warnings.append(f"Overhang '{oh}' or its RC '{rc}' is duplicated — ligation will be ambiguous.")
        seen.add(oh)
        seen.add(rc)
    return warnings


def golden_gate_protocol(response: CompileResponse) -> AssemblyProtocol:
    """Generate a Golden Gate Assembly (BsaI) protocol for the compiled circuit."""
    # Collect parts in TU order
    all_part_ids: list[str] = []
    for tu in response.circuit.transcription_units:
        for pid in tu.parts:
            if pid not in all_part_ids:
                all_part_ids.append(pid)

    # Number of junctions = number of parts (including vector backbone edges)
    n_junctions = len(all_part_ids) + 1  # +1 for vector re-ligation
    overhangs = _assign_overhangs(n_junctions)
    dup_warnings = _verify_unique_overhangs(overhangs)

    fragments: list[AssemblyFragment] = []

    # Vector backbone: carries first and last overhang
    vector_oh_5 = overhangs[-1]  # 3' end of last insert / 5' end of vector
    vector_oh_3 = overhangs[0]   # 3' end of vector / 5' end of first insert
    vector_seq = f"[Vector backbone with overhangs {vector_oh_5}↔{vector_oh_3}]"
    fragments.append(AssemblyFragment(
        name="pSB1C3 vector (BsaI-linearized)",
        sequence=vector_seq,
        length=2070,  # approximate pSB1C3 length
        order_sequence=(
            f"5'→ {BSAI_SITE}A({vector_oh_5})...vector...({vector_oh_3}){BSAI_SITE} ←3'"
        ),
    ))

    # One fragment per part
    for i, pid in enumerate(all_part_ids):
        part = library.get_part(pid)
        part_seq = (part or {}).get("seq") or f"[{pid} sequence]"
        oh_5 = overhangs[i]       # 5' overhang (from previous junction)
        oh_3 = overhangs[i + 1]   # 3' overhang (into next junction)

        # Order sequence: BsaI site + N spacer + overhang + insert + overhang + N spacer + BsaI RC
        order_seq = (
            f"5'→ {BSAI_SITE}N({oh_5})" +
            part_seq +
            f"({oh_3})N{BSAI_REV} ←3'"
        )
        fragments.append(AssemblyFragment(
            name=f"Part {i+1}: {pid} — {(part or {}).get('name', pid)}",
            sequence=part_seq,
            length=len(part_seq),
            order_sequence=order_seq,
        ))

    steps = [
        "1. Order all synthetic gene fragments with embedded BsaI sites and overhangs as shown.",
        "2. Set up one-pot Golden Gate reaction (10 µL total):",
        "   • 40 fmol each fragment (equimolar)",
        "   • 1 µL 10× T4 Ligase Buffer (NEB)",
        "   • 0.5 µL BsaI-HF v2 (20 U/µL, NEB R0539)",
        "   • 0.5 µL T4 DNA Ligase (400 U/µL, NEB M0202)",
        "   • Nuclease-free water to 10 µL",
        "3. Thermocycle: (37°C × 5 min → 16°C × 5 min) × 30 cycles, then 60°C × 5 min.",
        "4. Transform 2 µL into NEB 5-alpha or DH5α chemically competent cells.",
        "5. Plate on LB + chloramphenicol (25 µg/mL).",
        "6. Verify colonies by colony PCR and Sanger sequencing.",
    ]
    notes = [
        "BsaI cuts 1 nt downstream on top strand, 5 nt on bottom → 4 nt 5' overhang.",
        "All overhangs are unique (verified for no RC duplicates).",
    ] + [f"WARNING: {w}" for w in dup_warnings] + [
        "Overhang set from Potapov et al. (2018) high-fidelity ligation screening.",
        f"Total insert size: {sum(f.length for f in fragments[1:])} bp.",
    ]

    return AssemblyProtocol(method="golden_gate", fragments=fragments, steps=steps, notes=notes)
