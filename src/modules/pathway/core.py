"""Simplified Flux Balance Analysis using scipy.optimize.linprog.

Maximise an objective reaction subject to steady-state mass balance (S·v = 0)
and per-reaction flux bounds. Also ships a couple of small built-in pathway
templates (no live KEGG dependency).
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import linprog


def run_fba(metabolites: list[str], reactions: list[dict], objective: str) -> dict:
    """Maximise flux through `objective` at metabolic steady state.

    reactions: [{id, stoich: {metabolite: coefficient}, lb, ub}]
    Returns fluxes, the objective value, and bottleneck reactions (at their upper bound).
    """
    if not reactions:
        raise ValueError("No reactions provided.")
    rxn_ids = [r["id"] for r in reactions]
    if objective not in rxn_ids:
        raise ValueError(f"Objective reaction '{objective}' not found.")

    n_r = len(reactions)
    met_index = {m: i for i, m in enumerate(metabolites)}

    # Stoichiometric matrix S (metabolites × reactions) for the equality S·v = 0.
    S = np.zeros((len(metabolites), n_r))
    for j, r in enumerate(reactions):
        for met, coeff in (r.get("stoich") or {}).items():
            if met in met_index:
                S[met_index[met], j] += coeff

    bounds = [(r.get("lb", 0.0), r.get("ub", 1000.0)) for r in reactions]

    # linprog minimises, so minimise the negative of the objective flux.
    c = np.zeros(n_r)
    c[rxn_ids.index(objective)] = -1.0

    res = linprog(c, A_eq=S, b_eq=np.zeros(len(metabolites)), bounds=bounds, method="highs")
    if not res.success:
        return {"status": "infeasible", "message": res.message, "fluxes": {}, "objective_value": 0.0}

    fluxes = {rid: round(float(v), 4) for rid, v in zip(rxn_ids, res.x)}
    obj_val = round(-float(res.fun), 4)

    # Bottlenecks: reactions pinned at their upper bound (limiting the objective).
    bottlenecks = [
        rid for rid, r in zip(rxn_ids, reactions)
        if abs(fluxes[rid] - r.get("ub", 1000.0)) < 1e-6 and fluxes[rid] > 1e-6
    ]
    return {
        "status": "optimal",
        "fluxes": fluxes,
        "objective": objective,
        "objective_value": obj_val,
        "bottlenecks": bottlenecks,
    }


# --------------------------------------------------------------------------- #
# Built-in pathway templates (cached locally, KEGG-style)
# --------------------------------------------------------------------------- #
_TEMPLATES = {
    "upper_glycolysis": {
        "name": "Upper glycolysis (glucose → pyruvate, simplified)",
        "metabolites": ["glucose", "G6P", "F6P", "FBP", "pyruvate", "ATP", "ADP", "NADH"],
        "reactions": [
            {"id": "GLC_uptake", "stoich": {"glucose": 1}, "lb": 0, "ub": 10, "enzyme": "transporter"},
            {"id": "HEX", "stoich": {"glucose": -1, "ATP": -1, "G6P": 1, "ADP": 1}, "lb": 0, "ub": 1000, "enzyme": "hexokinase"},
            {"id": "PGI", "stoich": {"G6P": -1, "F6P": 1}, "lb": 0, "ub": 1000, "enzyme": "phosphoglucose isomerase"},
            {"id": "PFK", "stoich": {"F6P": -1, "ATP": -1, "FBP": 1, "ADP": 1}, "lb": 0, "ub": 1000, "enzyme": "phosphofructokinase"},
            {"id": "ALD_etc", "stoich": {"FBP": -1, "pyruvate": 2, "ATP": 2, "ADP": -2, "NADH": 2}, "lb": 0, "ub": 1000, "enzyme": "aldolase…pyruvate kinase"},
            {"id": "PYR_sink", "stoich": {"pyruvate": -1}, "lb": 0, "ub": 1000, "enzyme": "secretion"},
            {"id": "ATP_use", "stoich": {"ATP": -1, "ADP": 1}, "lb": 0, "ub": 1000, "enzyme": "maintenance"},
            {"id": "NADH_sink", "stoich": {"NADH": -1}, "lb": 0, "ub": 1000, "enzyme": "oxidation"},
        ],
        "objective": "PYR_sink",
    },
}


def list_templates() -> list[dict]:
    return [{"id": k, "name": v["name"]} for k, v in _TEMPLATES.items()]


def get_template(template_id: str) -> dict | None:
    return _TEMPLATES.get(template_id)
