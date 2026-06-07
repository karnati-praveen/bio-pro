"""SBOL3 export: a structural, design-level representation of the circuit.

Each distinct part becomes an SBOL ``Component`` (with an SO role and, where available,
a ``Sequence``). Each transcription unit becomes a composite ``Component`` whose ordered
``SubComponent`` features reference the part Components. This is design-level, so it works
even for parts without a sequence (the synthetic logic promoters).

``sbol3`` is an optional dependency; import errors surface as a clear message to the
endpoint rather than breaking the other exporters.
"""

from modules.parts import library
from shared.schemas.schemas import CompileResponse

_NAMESPACE = "http://bio-pro.example/designs"


def _import_sbol3():
    try:
        import sbol3  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - exercised only without the dep
        raise RuntimeError(
            "SBOL export requires the 'sbol3' package (pip install sbol3)."
        ) from exc
    return sbol3


def to_sbol(response: CompileResponse) -> str:
    sbol3 = _import_sbol3()
    sbol3.set_namespace(_NAMESPACE)

    role_for = {
        "promoter": sbol3.SO_PROMOTER,
        "rbs": sbol3.SO_RBS,
        "cds": sbol3.SO_CDS,
        "terminator": sbol3.SO_TERMINATOR,
    }

    doc = sbol3.Document()
    part_components: dict[str, object] = {}

    def component_for(part_id: str):
        if part_id in part_components:
            return part_components[part_id]
        part = library.get_part(part_id) or {}
        roles = [role_for[part["type"]]] if part.get("type") in role_for else []
        comp = sbol3.Component(part_id, sbol3.SBO_DNA, roles=roles, name=part.get("name"))
        if part.get("seq"):
            seq = sbol3.Sequence(
                f"{part_id}_seq",
                elements=part["seq"].lower(),
                encoding=sbol3.IUPAC_DNA_ENCODING,
            )
            doc.add(seq)
            comp.sequences = [seq.identity]
        doc.add(comp)
        part_components[part_id] = comp
        return comp

    for i, tu in enumerate(response.circuit.transcription_units, start=1):
        tu_comp = sbol3.Component(f"TU{i}", sbol3.SBO_DNA, name=tu.name)
        for part_id in tu.parts:
            sub = sbol3.SubComponent(component_for(part_id))
            tu_comp.features.append(sub)
        doc.add(tu_comp)

    return doc.write_string(sbol3.RDF_XML)
