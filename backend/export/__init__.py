"""Export an assembled design to standard formats so it can leave the tool.

Formats:
* ``genbank`` / ``fasta`` -- annotated DNA, built from the per-part sequences in the
  parts library (requires BioPython).
* ``sbol``                -- structural SBOL3 (requires sbol3); design-level, works even
  where a part has no sequence.
* ``json``                -- a self-contained bundle (spec + circuit + validation + sim).

Each exporter takes a ``CompileResponse`` and returns ``(text, media_type, suffix)``.
"""

from models.schemas import CompileResponse

FORMATS = ("genbank", "fasta", "sbol", "json")


def export(response: CompileResponse, fmt: str) -> tuple[str, str, str]:
    """Dispatch to the requested format. Raises ValueError on an unknown format."""
    if fmt == "genbank":
        from export import genbank

        return genbank.to_genbank(response), "chemical/x-genbank", "gb"
    if fmt == "fasta":
        from export import fasta

        return fasta.to_fasta(response), "text/x-fasta", "fasta"
    if fmt == "sbol":
        from export import sbol

        return sbol.to_sbol(response), "application/rdf+xml", "xml"
    if fmt == "json":
        from export import bundle

        return bundle.to_bundle(response), "application/json", "json"
    raise ValueError(f"Unknown export format '{fmt}'. Supported: {', '.join(FORMATS)}.")
