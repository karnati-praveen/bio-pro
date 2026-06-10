"""Build annotated BioPython SeqRecords from an assembled circuit.

One record per transcription unit. Each part with a sequence becomes a labelled
``SeqFeature`` at its offset within the unit. Parts without a catalogued sequence
(e.g. the synthetic pAND/pOR logic-gate promoters) receive a poly-N placeholder of
``_PLACEHOLDER_LEN`` bases so the record remains structurally complete. The feature's
/note qualifier documents the substitution explicitly, and a record-level COMMENT is
added when any placeholder was used — downstream tools should treat those Ns as
unknown sequence, not real DNA.
"""

from Bio.Seq import Seq
from Bio.SeqFeature import FeatureLocation, SeqFeature
from Bio.SeqRecord import SeqRecord

from modules.parts import library
from shared.schemas.schemas import CompileResponse

# Standard BioBrick flanking sequences (EcoRI-XbaI prefix, SpeI-PstI suffix)
BIOBRICK_PREFIX = "GAATTCGCGGCCGCTTCTAGA"
BIOBRICK_SUFFIX = "TACTAGTAGCGGCCGCTGCAG"

# Placeholder for parts with no catalogued sequence (e.g. synthetic logic promoters).
# 20 Ns is the minimum length that keeps feature locations non-degenerate.
_PLACEHOLDER_LEN = 20
_PLACEHOLDER_SEQ = "N" * _PLACEHOLDER_LEN
_PLACEHOLDER_COMMENT = (
    "One or more parts in this transcription unit lack a catalogued sequence. "
    f"A {_PLACEHOLDER_LEN}-nt poly-N placeholder has been substituted at each such "
    "position (marked SYNTHETIC_PLACEHOLDER in the /note qualifier). "
    "Replace Ns with the actual sequence before synthesis."
)

# Map our part types to GenBank feature keys.
_FEATURE_KEY = {
    "promoter": "promoter",
    "rbs": "RBS",
    "cds": "CDS",
    "terminator": "terminator",
}


def tu_records(response: CompileResponse) -> list[SeqRecord]:
    """Return one annotated SeqRecord per transcription unit, with BioBrick flanking."""
    records: list[SeqRecord] = []
    for i, tu in enumerate(response.circuit.transcription_units, start=1):
        seq_str = BIOBRICK_PREFIX
        features: list[SeqFeature] = []
        offset = len(BIOBRICK_PREFIX)
        has_placeholders = False

        # Prefix feature annotation
        features.append(SeqFeature(
            FeatureLocation(0, len(BIOBRICK_PREFIX)),
            type="misc_feature",
            qualifiers={"label": "BioBrick prefix", "note": "EcoRI-XbaI BioBrick prefix"},
        ))

        for part_id in tu.parts:
            part = library.get_part(part_id)
            part_seq = (part or {}).get("seq") or ""
            ptype = (part or {}).get("type", "")
            key = _FEATURE_KEY.get(ptype, "misc_feature")
            qualifiers = {
                "label": part_id,
                "note": (part or {}).get("description", part_id),
            }
            if not part_seq:
                has_placeholders = True
                part_seq = _PLACEHOLDER_SEQ
                key = "misc_feature"
                qualifiers = {
                    "label": part_id,
                    "note": (
                        f"SYNTHETIC_PLACEHOLDER: {part_id} has no catalogued sequence; "
                        f"{_PLACEHOLDER_LEN} Ns substituted for structural completeness"
                    ),
                }
            features.append(SeqFeature(
                FeatureLocation(offset, offset + len(part_seq)),
                type=key,
                qualifiers=qualifiers,
            ))
            seq_str += part_seq
            offset += len(part_seq)

        seq_str += BIOBRICK_SUFFIX
        features.append(SeqFeature(
            FeatureLocation(offset, offset + len(BIOBRICK_SUFFIX)),
            type="misc_feature",
            qualifiers={"label": "BioBrick suffix", "note": "SpeI-PstI BioBrick suffix"},
        ))

        record = SeqRecord(
            Seq(seq_str),
            id=f"TU{i}",
            name=f"TU{i}"[:16],
            description=tu.name,
            features=features,
        )
        record.annotations["molecule_type"] = "DNA"
        record.annotations["topology"] = "linear"
        if has_placeholders:
            record.annotations["comment"] = _PLACEHOLDER_COMMENT
        records.append(record)
    return records
