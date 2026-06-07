"""Chemistry module: PubChem-backed properties, MS isotopes, reaction SMILES,
and reaction-kinetics ODEs. No RDKit dependency."""

from modules.chemistry.core import (  # noqa: F401
    pubchem_properties,
    offline_properties,
    pubchem_sdf,
    formula_from_smiles,
    mass_from_formula,
    isotope_pattern,
    reaction_smiles,
    lipinski,
    kinetics,
)
