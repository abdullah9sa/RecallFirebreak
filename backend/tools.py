"""Agent tools. Each tool takes (ctx, args) and returns a JSON-serialisable dict.

Hard guardrails live HERE (in code), not only in the prompt:
  * CLASS_III recalls can never lock items or draft purchase orders.
  * lock_items may only lock what extract_recall actually extracted.
  * A PO can only be drafted from a real, in-stock substitute after
    get_inventory has been called.
  * There is deliberately NO approve tool; humans approve via the API.
"""
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from pydantic import ValidationError

from .models import ExtractedRecall, HazardSeverity, PurchaseOrderDraft, SubstituteProduct
from .state import state

DATA_DIR = Path(__file__).parent / "data"
SAFETY_BUFFER_DAYS = 14.0
URGENT_THRESHOLD_DAYS = 4.0


def _load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@dataclass
class RunContext:
    """Per-run scratchpad: what the agent has established so far + UI events."""
    recall: Optional[ExtractedRecall] = None
    inventory: Optional[Dict[str, Any]] = None
    events: List[dict] = field(default_factory=list)

    def emit(self, event: dict) -> None:
        self.events.append(event)


def _is_critical(ctx: RunContext) -> bool:
    return ctx.recall is not None and ctx.recall.hazard_class in (
        HazardSeverity.CLASS_I,
        HazardSeverity.CLASS_II,
    )


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #
def extract_recall(ctx: RunContext, args: dict) -> dict:
    try:
        recall = ExtractedRecall(**args)
    except ValidationError as e:
        problems = [
            {"field": ".".join(str(p) for p in err["loc"]), "problem": err["msg"]}
            for err in e.errors()
        ]
        return {"error": "VALIDATION_FAILED", "problems": problems,
                "hint": "Fix the listed fields using the bulletin text and call extract_recall again."}
    ctx.recall = recall
    return {"status": "EXTRACTED", "recall": recall.model_dump(mode="json")}


def lock_items(ctx: RunContext, args: dict) -> dict:
    if ctx.recall is None:
        return {"error": "NO_RECALL", "hint": "Call extract_recall first."}
    if not _is_critical(ctx):
        return {"error": "POLICY_VIOLATION",
                "message": f"{ctx.recall.hazard_class.value} recalls must NOT lock the point of sale."}
    gtin = str(args.get("gtin", "")).strip()
    lots = [str(x).strip() for x in args.get("lot_numbers", [])]
    if gtin != ctx.recall.gtin:
        return {"error": "GTIN_MISMATCH", "message": "GTIN does not match the extracted recall."}
    unknown = [l for l in lots if l not in ctx.recall.lot_numbers]
    if not lots or unknown:
        return {"error": "LOT_MISMATCH", "message": f"Lots not in extracted recall: {unknown or 'none given'}"}

    newly = state.add_to_quarantine(gtin, lots)
    ctx.emit({
        "type": "lockout",
        "gtin": gtin,
        "lots": lots,
        "brand_name": ctx.recall.brand_name,
        "bulletin_id": ctx.recall.bulletin_id,
        "message": f"CRITICAL RECALL: {ctx.recall.recall_reason}",
    })
    return {"status": "LOCKED", "gtin": gtin, "lots": lots, "newly_locked": newly}


def get_inventory(ctx: RunContext, args: dict) -> dict:
    gtin = str(args.get("gtin", "")).strip()
    inv = _load("inventory.json")
    for node in inv["hospital_nodes"]:
        for item in node["inventory"]:
            if item["gtin"] != gtin:
                continue
            quarantined = sum(
                b["units"] for b in item["batches"] if state.is_quarantined(gtin, b["lot_number"])
            )
            burn = float(item["daily_burn_rate"])
            on_hand = int(item["total_on_hand"])
            days_before = round(on_hand / burn, 1)
            snap = state.apply_quarantine_inventory_drop(quarantined, total_units=on_hand, daily_burn=burn)
            days_after = snap["days_remaining"]
            urgent = days_after <= URGENT_THRESHOLD_DAYS
            units_needed = (
                int(math.ceil(((SAFETY_BUFFER_DAYS - days_after) * burn) / 100.0) * 100) if urgent else 0
            )
            result = {
                "node_id": node["node_id"],
                "hospital_name": node["name"],
                "brand_name": item["brand_name"],
                "atc_code": item["atc_code"],
                "on_hand_units": on_hand,
                "quarantined_units": quarantined,
                "usable_units": on_hand - quarantined,
                "daily_burn_rate": burn,
                "days_before": days_before,
                "days_remaining": days_after,
                "urgent": urgent,
                "units_needed_for_14_day_buffer": units_needed,
            }
            ctx.inventory = result
            ctx.emit({"type": "inventory", **result})
            return result
    return {"error": "GTIN_NOT_IN_INVENTORY", "gtin": gtin}


def _distributor_stock() -> Dict[str, dict]:
    stock = {}
    for dist in _load("inventory.json")["distributors"]:
        for entry in dist["catalog"]:
            stock[entry["supplier_sku"]] = {**entry, "supplier_name": dist["name"]}
    return stock


def find_substitutes(ctx: RunContext, args: dict) -> dict:
    atc = str(args.get("atc_code", "")).strip()
    units_needed = int(args.get("units_needed", 0) or 0)
    mapping = _load("substitutes.json")["mappings"].get(atc)
    if not mapping:
        return {"error": "NO_SUBSTITUTION_DATA", "atc_code": atc}
    stock = _distributor_stock()
    candidates = []
    for alt in mapping["alternatives"]:
        live = stock.get(alt["supplier_sku"], {})
        available = int(live.get("available_units", 0))
        candidates.append({
            "supplier_sku": alt["supplier_sku"],
            "atc_code": alt["atc_code"],
            "brand_name": alt["brand_name"],
            "equivalence_level": alt["equivalence_level"],
            "supplier_name": alt["supplier_name"],
            "available_units": available,
            "stock_sufficient": available >= units_needed,
            "delivery_sla_hours": alt["delivery_sla_hours"],
            "unit_price_sek": alt["unit_price_sek"],
            "clinical_notes": alt["clinical_notes"],
        })
    # Sufficient stock first, then fastest delivery, then cheapest.
    candidates.sort(key=lambda c: (not c["stock_sufficient"], c["delivery_sla_hours"], c["unit_price_sek"]))
    return {"atc_code": atc, "units_needed": units_needed, "candidates": candidates}


def draft_purchase_order(ctx: RunContext, args: dict) -> dict:
    if ctx.recall is None:
        return {"error": "NO_RECALL", "hint": "Call extract_recall first."}
    if not _is_critical(ctx):
        return {"error": "POLICY_VIOLATION",
                "message": f"{ctx.recall.hazard_class.value} recalls must NOT trigger emergency procurement."}
    if ctx.inventory is None:
        return {"error": "NO_INVENTORY", "hint": "Call get_inventory first."}

    sku = str(args.get("supplier_sku", "")).strip()
    units = int(args.get("units", 0) or 0)
    rationale = str(args.get("rationale", "")).strip()
    mapping = _load("substitutes.json")["mappings"].get(ctx.recall.atc_code, {})
    alt = next((a for a in mapping.get("alternatives", []) if a["supplier_sku"] == sku), None)
    if alt is None:
        return {"error": "UNKNOWN_SKU", "message": f"{sku} is not a known substitute for {ctx.recall.atc_code}."}
    available = int(_distributor_stock().get(sku, {}).get("available_units", 0))
    if units <= 0 or units > available:
        return {"error": "INSUFFICIENT_STOCK", "requested": units, "available": available}
    if not rationale:
        return {"error": "RATIONALE_REQUIRED", "hint": "Provide a short clinical rationale for the audit trail."}

    inv = ctx.inventory
    po = PurchaseOrderDraft(
        po_id="PO-" + ctx.recall.bulletin_id.replace("LV-", ""),
        status="AWAITING_APPROVAL",
        urgency_tier="CRITICAL_SHORTAGE_IMMINENT" if inv["urgent"] else "ELEVATED",
        originating_node=inv["hospital_name"],
        quarantined_gtin=ctx.recall.gtin,
        quarantined_lot=", ".join(ctx.recall.lot_numbers),
        quarantined_units=inv["quarantined_units"],
        days_remaining=inv["days_remaining"],
        recommended_substitute=SubstituteProduct(
            atc_code=alt["atc_code"],
            substance=alt["substance"],
            brand_name=alt["brand_name"],
            supplier_name=alt["supplier_name"],
            supplier_sku=alt["supplier_sku"],
            units_available=available,
            delivery_sla_hours=alt["delivery_sla_hours"],
            unit_price_sek=alt["unit_price_sek"],
        ),
        requested_units=units,
        estimated_cost_sek=round(units * alt["unit_price_sek"], 2),
        audit_rationale=rationale,
        created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    ).model_dump(mode="json")
    state.stage_po(po)
    ctx.emit({"type": "po_draft", "po": po})
    return {"status": "PO_STAGED_AWAITING_HUMAN_APPROVAL", "po_id": po["po_id"],
            "estimated_cost_sek": po["estimated_cost_sek"]}


def log_audit_note(ctx: RunContext, args: dict) -> dict:
    note = str(args.get("note", "")).strip()
    follow_up = str(args.get("follow_up", "")).strip()
    if not note:
        return {"error": "NOTE_REQUIRED"}
    entry = {"bulletin_id": ctx.recall.bulletin_id if ctx.recall else None,
             "note": note, "follow_up": follow_up}
    ctx.emit({"type": "audit_note", **entry})
    return {"status": "LOGGED", **entry}


# --------------------------------------------------------------------------- #
# Registry + OpenAI-style tool schemas
# --------------------------------------------------------------------------- #
TOOL_FUNCS: Dict[str, Callable[[RunContext, dict], dict]] = {
    "extract_recall": extract_recall,
    "lock_items": lock_items,
    "get_inventory": get_inventory,
    "find_substitutes": find_substitutes,
    "draft_purchase_order": draft_purchase_order,
    "log_audit_note": log_audit_note,
}

_S = {"type": "string"}


def _tool(name: str, description: str, properties: dict, required: List[str]) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required}}}


TOOL_SCHEMAS: List[dict] = [
    _tool(
        "extract_recall",
        "Record the structured recall facts you read from the bulletin. Validated strictly "
        "(GTIN = 14 digits, ATC = 7 chars like J01CA04); on validation errors fix and call again.",
        {
            "bulletin_id": _S,
            "issuing_authority": _S,
            "substance": _S,
            "brand_name": _S,
            "atc_code": {**_S, "description": "7-character WHO ATC code, e.g. J01CA04"},
            "gtin": {**_S, "description": "14-digit GTIN"},
            "vnr": _S,
            "lot_numbers": {"type": "array", "items": _S, "description": "ONLY the recalled lots"},
            "expiry_dates": {"type": "array", "items": _S},
            "hazard_class": {"type": "string", "enum": ["CLASS_I", "CLASS_II", "CLASS_III"]},
            "recall_reason": _S,
        },
        ["bulletin_id", "substance", "brand_name", "atc_code", "gtin",
         "lot_numbers", "hazard_class", "recall_reason"],
    ),
    _tool(
        "lock_items",
        "Engage the point-of-sale kill-switch for the recalled GTIN + lots. Only for CLASS_I / CLASS_II.",
        {"gtin": _S, "lot_numbers": {"type": "array", "items": _S}},
        ["gtin", "lot_numbers"],
    ),
    _tool(
        "get_inventory",
        "Get hospital stock and days-of-supply for a GTIN, reflecting any quarantine already applied.",
        {"gtin": _S},
        ["gtin"],
    ),
    _tool(
        "find_substitutes",
        "List substitute products for an ATC code with live wholesaler stock, best first.",
        {"atc_code": _S, "units_needed": {"type": "integer"}},
        ["atc_code", "units_needed"],
    ),
    _tool(
        "draft_purchase_order",
        "Draft (never approve) an emergency purchase order for human one-click approval.",
        {"supplier_sku": _S, "units": {"type": "integer"},
         "rationale": {**_S, "description": "Short clinical + logistical justification"}},
        ["supplier_sku", "units", "rationale"],
    ),
    _tool(
        "log_audit_note",
        "Record an audit note for a recall that needs NO lockout (e.g. CLASS_III), "
        "with a follow-up for the next routine review.",
        {"note": _S, "follow_up": _S},
        ["note"],
    ),
]
