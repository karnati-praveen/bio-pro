"""Core DNA sequence operations — pure Python, no third-party dependencies.

Used by the /api/sequence/* router and reusable from the MCP server.
"""

import re

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
_COMPLEMENT = str.maketrans("ACGTUacgtuNn", "TGCAAtgcaaNn")

# Standard genetic code (DNA codons → 1-letter amino acid; * = stop)
CODON_TABLE = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "CTT": "L", "CTC": "L",
    "CTA": "L", "CTG": "L", "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V", "TCT": "S", "TCC": "S",
    "TCA": "S", "TCG": "S", "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T", "GCT": "A", "GCC": "A",
    "GCA": "A", "GCG": "A", "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q", "AAT": "N", "AAC": "N",
    "AAA": "K", "AAG": "K", "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W", "CGT": "R", "CGC": "R",
    "CGA": "R", "CGG": "R", "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

# Common Type-II restriction enzymes (palindromic recognition sites)
ENZYMES: dict[str, str] = {
    "EcoRI": "GAATTC", "BamHI": "GGATCC", "HindIII": "AAGCTT", "NheI": "GCTAGC",
    "SpeI": "ACTAGT", "PstI": "CTGCAG", "XhoI": "CTCGAG", "NotI": "GCGGCCGC",
    "XbaI": "TCTAGA", "SalI": "GTCGAC", "KpnI": "GGTACC", "SacI": "GAGCTC",
    "SmaI": "CCCGGG", "NcoI": "CCATGG", "NdeI": "CATATG", "BglII": "AGATCT",
    "BsaI": "GGTCTC",
}


def _clean(seq: str) -> str:
    return re.sub(r"[^ACGTUN]", "", (seq or "").upper())


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def parse_sequence(filename: str, content: str) -> dict:
    """Parse FASTA / GenBank / plain text into {name, sequence, features, topology, length}."""
    name = (filename or "sequence").rsplit("/", 1)[-1]
    lower = (filename or "").lower()
    text = content or ""

    if lower.endswith((".gb", ".gbk")) or text.lstrip().startswith("LOCUS"):
        return _parse_genbank(name, text)
    if text.lstrip().startswith(">") or lower.endswith((".fasta", ".fa")):
        return _parse_fasta(name, text)
    return {
        "name": name, "sequence": _clean(text), "features": [],
        "topology": "linear", "length": len(_clean(text)),
    }


def _parse_fasta(name: str, text: str) -> dict:
    lines = text.splitlines()
    header = next((ln for ln in lines if ln.startswith(">")), None)
    seq = _clean("".join(ln for ln in lines if not ln.startswith(">")))
    if header:
        name = header[1:].strip().split()[0] or name
    return {"name": name, "sequence": seq, "features": [], "topology": "linear", "length": len(seq)}


def _parse_genbank(name: str, text: str) -> dict:
    topology = "circular" if re.search(r"(?i)\bcircular\b", text.split("\n", 1)[0]) else "linear"
    m = re.search(r"(?im)^LOCUS\s+(\S+)", text)
    if m:
        name = m.group(1)

    # Sequence from the ORIGIN block
    seq = ""
    origin = re.search(r"(?is)ORIGIN(.*?)//", text)
    if origin:
        seq = _clean(re.sub(r"[\d\s]", "", origin.group(1)))

    # Minimal feature parse: "  type  start..end"
    features = []
    for fm in re.finditer(r"(?im)^\s{5}(\w+)\s+(complement\()?(<?\d+)\.\.(>?\d+)", text):
        ftype, comp, start, end = fm.group(1), fm.group(2), fm.group(3), fm.group(4)
        if ftype == "source":
            continue
        # capture a /label or /gene qualifier following the feature, if present
        tail = text[fm.end():fm.end() + 400]
        label = None
        lm = re.search(r'/(?:label|gene|product)="?([^"\n]+)', tail)
        if lm:
            label = lm.group(1).strip()
        features.append({
            "type": ftype,
            "start": int(start.lstrip("<")) - 1,
            "end": int(end.lstrip(">")),
            "strand": -1 if comp else 1,
            "label": label or ftype,
        })
    return {"name": name, "sequence": seq, "features": features,
            "topology": topology, "length": len(seq)}


# --------------------------------------------------------------------------- #
# Operations
# --------------------------------------------------------------------------- #
def reverse_complement(seq: str) -> str:
    return _clean(seq)[::-1].translate(_COMPLEMENT)


def translate(seq: str, frame: int = 0) -> dict:
    s = _clean(seq)[frame:]
    codons = [s[i:i + 3] for i in range(0, len(s) - 2, 3)]
    protein = "".join(CODON_TABLE.get(c, "X") for c in codons)
    return {"protein": protein, "codons": codons}


def gc_content(seq: str, window: int = 50) -> dict:
    s = _clean(seq)
    n = len(s)
    if n == 0:
        return {"positions": [], "gc": [], "overall": 0.0}
    w = max(2, min(window, n))
    positions, gc = [], []
    for i in range(0, n - w + 1, max(1, w // 4)):
        sub = s[i:i + w]
        frac = (sub.count("G") + sub.count("C")) / len(sub)
        positions.append(i + w // 2)
        gc.append(round(frac * 100, 1))
    overall = round((s.count("G") + s.count("C")) / n * 100, 1)
    return {"positions": positions, "gc": gc, "overall": overall}


def find_orfs(seq: str, min_len: int = 90) -> list[dict]:
    """Find ORFs (ATG…stop) on both strands; min_len in nucleotides."""
    s = _clean(seq)
    orfs: list[dict] = []
    for strand, work in ((1, s), (-1, reverse_complement(s))):
        for frame in range(3):
            i = frame
            while i < len(work) - 2:
                if work[i:i + 3] == "ATG":
                    j = i
                    while j < len(work) - 2:
                        if CODON_TABLE.get(work[j:j + 3]) == "*":
                            length = j + 3 - i
                            if length >= min_len:
                                start = i if strand == 1 else len(s) - (j + 3)
                                end = (i + length) if strand == 1 else len(s) - i
                                orfs.append({"start": start, "end": end,
                                             "strand": strand, "length": length,
                                             "aa": length // 3 - 1})
                            i = j
                            break
                        j += 3
                i += 3
    orfs.sort(key=lambda o: o["start"])
    return orfs


def restriction_sites(seq: str, enzymes: list[str] | None = None) -> list[dict]:
    s = _clean(seq)
    chosen = enzymes or list(ENZYMES.keys())
    sites: list[dict] = []
    for name in chosen:
        site = ENZYMES.get(name)
        if not site:
            continue
        for m in re.finditer(f"(?={site})", s):
            sites.append({"enzyme": name, "site": site, "position": m.start()})
    sites.sort(key=lambda x: x["position"])
    return sites
