"""CRISPR guide RNA design: PAM enumeration, on-target scoring, off-target detection.
Supports SpCas9 (NGG), SaCas9 (NNGRRT), Cas12a/Cpf1 (TTTV 5' PAM)."""

from modules.crispr.core import (  # noqa: F401
    find_pam_sites,
    score_guide,
    design_guides,
    ENZYMES,
)
