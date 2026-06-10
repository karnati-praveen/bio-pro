"""Codon optimization API — POST /api/codon/optimize."""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules.codon import core
from modules.sequence.core import CODON_TABLE

router = APIRouter(prefix="/api/codon", tags=["codon"])


class CodonOptimizeRequest(BaseModel):
    sequence: str                               # protein (AA) or CDS (DNA)
    host: str = "ecoli"                         # ecoli | yeast | human
    avoid_enzymes: Optional[list[str]] = None  # specific enzymes; None = all known
    run_avoid_sites: bool = True               # set False to skip site removal
    gc_target: Optional[float] = None          # 0.3–0.7; None = skip GC balancing


@router.post("/optimize")
def codon_optimize(req: CodonOptimizeRequest) -> dict:
    """Back-translate or recode a sequence for the target host.

    Pipeline:
    1. optimize          — choose best codons; compute CAI before/after
    2. avoid_sites       — silently recode to destroy restriction sites /
                          poly-A signals / poly-T runs  (skippable)
    3. gc_window_balance — smooth extreme-GC 50-nt windows  (optional)

    Returns {optimized_seq, cai_before, cai_after, changes,
             removed_sites, codon_heatmap}.
    """
    try:
        result = core.optimize(req.sequence.strip(), req.host)

        if req.run_avoid_sites:
            site_result = core.avoid_sites(
                result["optimized_seq"],
                enzymes=req.avoid_enzymes,
            )
            result["optimized_seq"] = site_result["optimized_seq"]
            result["removed_sites"] = site_result["removed_sites"]

        if req.gc_target is not None:
            gc_result = core.gc_window_balance(
                result["optimized_seq"],
                target=float(req.gc_target),
            )
            result["optimized_seq"] = gc_result["optimized_seq"]

        # Rebuild heatmap for the final (post-pipeline) sequence
        table = core.CODON_USAGE[req.host]
        final = result["optimized_seq"]
        final_codons = [final[i:i + 3] for i in range(0, len(final) - 2, 3)]
        result["codon_heatmap"] = [
            {"codon": c, "amino_acid": CODON_TABLE.get(c, "X"), "w": core._codon_w(c, table)}
            for c in final_codons
        ]

        return result

    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
