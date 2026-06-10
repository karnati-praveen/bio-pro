"""Plasmid map layout engine: circular/linear SVG renderer data model.

Accepts FASTA/GenBank content (or a compiled circuit result) and returns
feature arcs, GC ring data, restriction-site markers, and origin position
for the frontend PlasmidMap.jsx component.
"""

from modules.seqmap.core import render_layout  # noqa: F401
