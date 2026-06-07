"""DNA sequence analysis: parsing, reverse-complement, translation, GC content,
ORF finding, and restriction-site mapping. Pure-Python, no external deps."""

from modules.sequence.core import (  # noqa: F401
    parse_sequence,
    reverse_complement,
    translate,
    gc_content,
    find_orfs,
    restriction_sites,
    ENZYMES,
)
