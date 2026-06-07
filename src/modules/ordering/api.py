"""Feature 9: DNA ordering integration.

Generates ordering links/payloads for IDT and Twist Bioscience.
IDT gBlock ordering uses URL parameters to pre-populate the cart.
Twist uses their Gene Fragment API endpoint format.
"""

import urllib.parse
from typing import Optional

from modules.parts import library
from shared.schemas.schemas import CompileResponse

IDT_GBLOCK_URL = "https://www.idtdna.com/pages/products/genes-and-gene-fragments/double-stranded-dna-fragments/gblocks-gene-fragments"
TWIST_ORDER_URL = "https://www.twistbioscience.com/products/genes"

# Pricing estimates (USD, approximate 2024)
IDT_GBLOCK_PRICE_PER_100BP = 0.09   # gBlocks: ~$0.09/bp for standard
TWIST_GENE_PRICE_PER_100BP = 0.089  # Twist gene fragments

MAX_GBLOCK_SIZE = 3000   # IDT gBlock max per fragment
OVERLAP_SIZE = 40        # overlap for multi-fragment assembly


def _split_sequence(seq: str, max_len: int, overlap: int) -> list[str]:
    """Split a long sequence into overlapping fragments for ordering."""
    if len(seq) <= max_len:
        return [seq]
    fragments = []
    start = 0
    while start < len(seq):
        end = min(start + max_len, len(seq))
        fragments.append(seq[start:end])
        if end >= len(seq):
            break
        start += max_len - overlap
    return fragments


def _estimate_cost(bp: int, price_per_100bp: float) -> float:
    return round(bp * price_per_100bp / 100, 2)


def _turnaround(bp: int) -> str:
    if bp < 500:
        return "2–5 business days"
    if bp < 2000:
        return "5–7 business days"
    return "7–14 business days"


class OrderItem:
    def __init__(self, name: str, sequence: str, vendor: str,
                 fragments: list[str], cost_usd: float, turnaround: str,
                 idt_url: Optional[str] = None):
        self.name = name
        self.sequence = sequence
        self.vendor = vendor
        self.fragments = fragments
        self.cost_usd = cost_usd
        self.turnaround = turnaround
        self.idt_url = idt_url

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "length_bp": len(self.sequence),
            "vendor": self.vendor,
            "n_fragments": len(self.fragments),
            "fragment_sequences": self.fragments,
            "estimated_cost_usd": self.cost_usd,
            "turnaround": self.turnaround,
            "idt_url": self.idt_url,
        }


def build_idt_url(name: str, sequence: str) -> str:
    """Build an IDT gBlock URL pre-populated with name and sequence."""
    params = urllib.parse.urlencode({
        "name": name[:80],
        "sequence": sequence[:3000],  # gBlock max
        "scale": "200ng",
        "purification": "standard",
    })
    return f"https://www.idtdna.com/site/order/gblock/order?{params}"


def build_twist_payload(name: str, sequence: str) -> dict:
    """Build a Twist Bioscience Gene Fragment order payload."""
    return {
        "name": name[:100],
        "sequence": sequence,
        "product": "gene_fragment",
        "scale_ng": 500,
        "delivery_format": "tube",
    }


def generate_orders(response: CompileResponse) -> list[dict]:
    """Generate ordering information for all TU sequences in the compiled circuit."""
    orders = []

    for i, tu in enumerate(response.circuit.transcription_units):
        # Build the TU sequence
        seq = ""
        for pid in tu.parts:
            part = library.get_part(pid)
            seq += (part or {}).get("seq") or ""

        if not seq:
            continue

        # Add BioBrick flanking
        from modules.export.records import BIOBRICK_PREFIX, BIOBRICK_SUFFIX
        full_seq = BIOBRICK_PREFIX + seq + BIOBRICK_SUFFIX
        bp = len(full_seq)

        # IDT gBlock (split if > 3000 bp)
        idt_frags = _split_sequence(full_seq, MAX_GBLOCK_SIZE, OVERLAP_SIZE)
        idt_cost = sum(_estimate_cost(len(f), IDT_GBLOCK_PRICE_PER_100BP) for f in idt_frags)
        idt_item = OrderItem(
            name=f"{tu.name} (IDT gBlock)",
            sequence=full_seq,
            vendor="IDT",
            fragments=idt_frags,
            cost_usd=idt_cost,
            turnaround=_turnaround(bp),
            idt_url=build_idt_url(f"TU{i+1}_{tu.name[:40]}", full_seq[:3000]),
        )

        # Twist gene fragment
        twist_frags = _split_sequence(full_seq, 5000, OVERLAP_SIZE)  # Twist can do up to 5 kb
        twist_cost = sum(_estimate_cost(len(f), TWIST_GENE_PRICE_PER_100BP) for f in twist_frags)
        twist_item = OrderItem(
            name=f"{tu.name} (Twist)",
            sequence=full_seq,
            vendor="Twist Bioscience",
            fragments=twist_frags,
            cost_usd=twist_cost,
            turnaround=_turnaround(bp),
        )

        orders.append({
            "tu_name": tu.name,
            "sequence": full_seq,
            "length_bp": bp,
            "idt": idt_item.to_dict(),
            "twist": twist_item.to_dict(),
        })

    return orders
