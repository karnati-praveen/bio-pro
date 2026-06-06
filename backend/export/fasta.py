"""FASTA export: one sequence per transcription unit."""

import io

from Bio import SeqIO

from export.records import tu_records
from models.schemas import CompileResponse


def to_fasta(response: CompileResponse) -> str:
    handle = io.StringIO()
    SeqIO.write(tu_records(response), handle, "fasta")
    return handle.getvalue()
