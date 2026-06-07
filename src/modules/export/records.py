"""Build annotated BioPython SeqRecords from an assembled circuit.

One record per transcription unit. Each part with a sequence becomes a labelled
``SeqFeature`` at its offset within the unit. Parts without a sequence (the synthetic
pAND/pOR logic promoters) are skipped in the base string but still noted as a
zero-length ``misc_feature`` so the annotation is honest about the gap.
"""

from Bio.Seq import Seq
from Bio.SeqFeature import FeatureLocation, SeqFeature
from Bio.SeqRecord import SeqRecord

from modules.parts import library
from shared.schemas.schemas import CompileResponse

# Standard BioBrick flanking sequences (EcoRI-XbaI prefix, SpeI-PstI suffix)
BIOBRICK_PREFIX = "GAATTCGCGGCCGCTTCTAGA"
BIOBRICK_SUFFIX = "TACTAGTAGCGGCCGCTGCAG"

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
                features.append(SeqFeature(
                    FeatureLocation(offset, offset),
                    type="misc_feature",
                    qualifiers={**qualifiers, "note": f"{part_id} (no sequence)"},
                ))
                continue
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
        records.append(record)
    return records
