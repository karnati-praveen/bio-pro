"""Gibson Assembly protocol generator.

For each junction between consecutive parts, generates 20 bp overlap sequences
that allow Gibson Assembly Master Mix to join fragments seamlessly.
"""

from models import library
from models.schemas import AssemblyFragment, AssemblyProtocol, CompileResponse
from export.records import BIOBRICK_PREFIX, BIOBRICK_SUFFIX

OVERLAP_LEN = 20          # Gibson Assembly standard overlap
MIN_FRAGMENT_LEN = 200    # fragments shorter than this get padding noted


def _overlap(seq_left: str, seq_right: str) -> str:
    """Return last OVERLAP_LEN bp of seq_left as the overlap for seq_right."""
    if len(seq_left) >= OVERLAP_LEN:
        return seq_left[-OVERLAP_LEN:]
    return seq_left + "N" * (OVERLAP_LEN - len(seq_left))


def gibson_protocol(response: CompileResponse) -> AssemblyProtocol:
    """Generate a Gibson Assembly protocol for the compiled circuit."""
    # Collect all part sequences in order from all TUs
    all_parts: list[tuple[str, str]] = []  # (part_id, sequence)

    for tu in response.circuit.transcription_units:
        for pid in tu.parts:
            part = library.get_part(pid)
            seq = (part or {}).get("seq") or ""
            all_parts.append((pid, seq))

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_parts: list[tuple[str, str]] = []
    for pid, seq in all_parts:
        if pid not in seen:
            seen.add(pid)
            unique_parts.append((pid, seq))

    # Build full circuit sequence
    circuit_seq = BIOBRICK_PREFIX + "".join(seq for _, seq in unique_parts) + BIOBRICK_SUFFIX

    # Split into fragments: one per TU for simplicity
    fragments: list[AssemblyFragment] = []
    offset = len(BIOBRICK_PREFIX)

    # Vector backbone fragment (BioBrick vector pSB1C3 linearized)
    vector_seq = BIOBRICK_PREFIX + BIOBRICK_SUFFIX
    vector_order_seq = (
        _overlap(BIOBRICK_SUFFIX, BIOBRICK_PREFIX) +
        vector_seq +
        _overlap(BIOBRICK_PREFIX, BIOBRICK_SUFFIX[:20])
    )
    fragments.append(AssemblyFragment(
        name="pSB1C3 vector (linearized)",
        sequence=vector_seq,
        length=len(vector_seq),
        order_sequence=vector_order_seq,
    ))

    # One fragment per TU
    for i, tu in enumerate(response.circuit.transcription_units):
        tu_seq = ""
        for pid in tu.parts:
            part = library.get_part(pid)
            tu_seq += (part or {}).get("seq") or ""

        if not tu_seq:
            continue

        prev_seq = BIOBRICK_PREFIX if i == 0 else "".join(
            (library.get_part(pid) or {}).get("seq") or ""
            for pid in response.circuit.transcription_units[i - 1].parts
        )

        next_seqs = []
        for j in range(i + 1, len(response.circuit.transcription_units)):
            next_tu_seq = "".join(
                (library.get_part(pid) or {}).get("seq") or ""
                for pid in response.circuit.transcription_units[j].parts
            )
            if next_tu_seq:
                next_seqs.append(next_tu_seq)
                break
        next_seq = next_seqs[0] if next_seqs else BIOBRICK_SUFFIX

        left_overlap = _overlap(prev_seq, tu_seq)
        right_overlap = next_seq[:OVERLAP_LEN] if len(next_seq) >= OVERLAP_LEN else next_seq

        order_seq = left_overlap + tu_seq + right_overlap
        fragments.append(AssemblyFragment(
            name=f"Fragment {i+1}: {tu.name}",
            sequence=tu_seq,
            length=len(tu_seq),
            order_sequence=order_seq,
        ))

    steps = [
        "1. Linearize pSB1C3 backbone by PCR or restriction digest (EcoRI + PstI).",
        f"2. PCR-amplify each of the {len(fragments)-1} insert fragment(s) with primers "
        f"containing {OVERLAP_LEN} bp overlaps matching adjacent fragments.",
        "3. Gel-purify or column-purify all fragments.",
        "4. Set up Gibson Assembly reaction:",
        "   - Mix equimolar amounts of all fragments (50 fmol each, total ≤20 µL).",
        "   - Add 20 µL of 2× Gibson Assembly Master Mix (NEB HiFi Assembly Mix).",
        "   - Incubate 50°C × 60 min (5 fragments) or 50°C × 15 min (≤5 short fragments).",
        "5. Place on ice. Transform 2 µL into 25 µL NEB 5-alpha competent E. coli.",
        "6. Plate on LB + chloramphenicol (25 µg/mL) plates.",
        "7. Pick colonies, verify by colony PCR with prefix/suffix primers.",
        "8. Sequence-verify with M13F/M13R primers.",
    ]
    notes = [
        f"Overlap length: {OVERLAP_LEN} bp (standard for fragments 100 bp–10 kb).",
        "Order sequences include the overlap regions needed for primer design.",
        f"Total assembled size (excluding vector): {sum(f.length for f in fragments[1:])} bp.",
        "Use Addgene's Gibson Assembly primer design tool to verify melting temperatures.",
    ]

    return AssemblyProtocol(method="gibson", fragments=fragments, steps=steps, notes=notes)
