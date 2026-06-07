"""GenBank export: annotated, multi-record (one LOCUS per transcription unit)."""

import io

from Bio import SeqIO

from modules.export.records import tu_records
from shared.schemas.schemas import CompileResponse


def to_genbank(response: CompileResponse) -> str:
    handle = io.StringIO()
    SeqIO.write(tu_records(response), handle, "genbank")
    return handle.getvalue()
