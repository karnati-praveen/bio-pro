"""Declarative compiler rules — pure data, fully auditable.

Each inducer maps to exactly one inducible promoter system.  Pattern keywords drive
the parser to the correct circuit topology in the assembler.
"""

# --------------------------------------------------------------------------- #
# Inducible systems: inducer → promoter/regulator/mode
# --------------------------------------------------------------------------- #
INDUCIBLE_SYSTEMS: dict[str, dict[str, str]] = {
    "IPTG":      {"promoter": "pLac",   "regulator": "LacI",  "mode": "derepress"},
    "aTc":       {"promoter": "pTet",   "regulator": "TetR",  "mode": "derepress"},
    "arabinose": {"promoter": "pBAD",   "regulator": "AraC",  "mode": "activate"},
    "AHL":       {"promoter": "pLuxR",  "regulator": "LuxR",  "mode": "activate"},
    "rhamnose":     {"promoter": "pRha",  "regulator": "RhaS",  "mode": "activate"},
    "vanillic_acid":{"promoter": "pVan",  "regulator": "VanR",  "mode": "derepress"},
}

# Constitutive promoter driving regulator expression
REGULATOR_PROMOTER = "pCon"

# Standard flanking parts
DEFAULT_RBS = "B0034"
DEFAULT_TERMINATOR = "B0015"

# --------------------------------------------------------------------------- #
# Toggle switch: two mutually repressing arms (Gardner et al. 2000)
# Each arm: pCon → repressor; arm1_promoter repressed by arm2_repressor and vice versa
# --------------------------------------------------------------------------- #
TOGGLE_SWITCH = {
    "arm1": {"promoter": "pCI",   "repressor": "cI",    "repressor_of": "pCI434"},
    "arm2": {"promoter": "pCI434", "repressor": "cI434", "repressor_of": "pCI"},
}

# --------------------------------------------------------------------------- #
# Repressilator: 3-gene ring of repression (Elowitz & Leibler 2000)
# LacI represses TetR, TetR represses cI, cI represses LacI
# --------------------------------------------------------------------------- #
REPRESSILATOR = [
    {"repressor": "LacI", "represses": "pTet",  "expressed_from": "pCI"},
    {"repressor": "TetR", "represses": "pCI",   "expressed_from": "pLac"},
    {"repressor": "cI",   "represses": "pLac",  "expressed_from": "pTet"},
]

# --------------------------------------------------------------------------- #
# Cross-reactivity table: known off-target interactions to flag as warnings
# --------------------------------------------------------------------------- #
CROSS_REACTIVITY: dict[str, list[str]] = {
    "LacI": ["pLac"],
    "TetR": ["pTet"],
    "AraC": ["pBAD"],
    # No known cross-reactivity between LacI/TetR/AraC at characterised concentrations,
    # but TetR can weakly bind similar operators at high expression:
}

# Pairs flagged as potentially cross-reactive in same circuit
ORTHOGONALITY_WARNINGS: list[tuple[str, str]] = [
    # (repressor_a, repressor_b): these should not be paired without characterisation
]


# --------------------------------------------------------------------------- #
# Helper functions
# --------------------------------------------------------------------------- #
def system_for_inducer(inducer_id: str) -> dict[str, str] | None:
    return INDUCIBLE_SYSTEMS.get(inducer_id)


def supported_inducers() -> list[str]:
    return list(INDUCIBLE_SYSTEMS.keys())


# --------------------------------------------------------------------------- #
# Pattern keyword lookup for free-text parser
# Each entry: list of keyword phrases that signal this pattern
# --------------------------------------------------------------------------- #
PATTERN_KEYWORDS: dict[str, list[str]] = {
    "toggle_switch": [
        "toggle", "bistable", "switch", "flip.flop", "genetic switch",
        "two.state", "bistability",
    ],
    "oscillator": [
        "oscillat", "repressilator", "clock", "periodic", "oscillation",
        "cycl", "rhythm",
    ],
    "negative_feedback": [
        "negative feedback", "self.repressing", "self repression",
        "autorepression", "negative autoregulation",
    ],
    "positive_feedback": [
        "positive feedback", "self.activat", "self activat",
        "autoactivation", "positive autoregulation",
    ],
    "feed_forward_loop": [
        "feed.forward", "feedforward", "coherent", "incoherent",
        "cascade with bypass",
    ],
    "band_pass_filter": [
        "band.pass", "bandpass", "band pass", "range", "only within",
        "concentration window", "expression window",
    ],
    "constitutive_expression": [
        "constitutive", "always.on", "always express", "constant",
        "no inducer", "without inducer", "independent",
    ],
}
