from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class HazardSeverity(str, Enum):
    CLASS_I = "CLASS_I"      # Critical life threat / toxic defect -> Immediate lock & PO
    CLASS_II = "CLASS_II"    # Significant illness / defect -> Lock & evaluate
    CLASS_III = "CLASS_III"  # Minor packaging / typography flaw -> Log only, NO lock


class ExtractedRecall(BaseModel):
    bulletin_id: str = Field(..., description="Regulatory order ID, e.g. LV-2026-0912")
    issuing_authority: str = Field(default="Läkemedelsverket", description="Regulatory authority name")
    substance: str = Field(..., description="Active pharmaceutical ingredient, e.g. Amoxicillin")
    brand_name: str = Field(..., description="Commercial brand name, e.g. Amimox 500mg")
    atc_code: str = Field(
        ...,
        pattern=r"^[A-Z]\d{2}[A-Z]{2}\d{2}$",
        description="7-character WHO ATC code, e.g. J01CA04"
    )
    gtin: str = Field(
        ...,
        pattern=r"^\d{14}$",
        description="14-digit GS1 Global Trade Item Number"
    )
    vnr: Optional[str] = Field(None, description="Nordic Article Number (Varunummer, 6 digits)")
    lot_numbers: List[str] = Field(..., min_length=1, description="Array of affected batch lot IDs")
    expiry_dates: List[str] = Field(default_factory=list, description="Array of expiration dates")
    hazard_class: HazardSeverity = Field(..., description="Hazard severity class (CLASS_I, CLASS_II, CLASS_III)")
    recall_reason: str = Field(..., description="Clinical rationale for recall")


class SubstituteProduct(BaseModel):
    atc_code: str
    substance: str
    brand_name: str
    supplier_name: str
    supplier_sku: str
    units_available: int
    delivery_sla_hours: int
    unit_price_sek: float


class PurchaseOrderDraft(BaseModel):
    po_id: str
    status: str = "AWAITING_APPROVAL"
    urgency_tier: str
    originating_node: str
    quarantined_gtin: str
    quarantined_lot: str
    quarantined_units: int
    days_remaining: float
    days_target: float = 14.0
    recommended_substitute: SubstituteProduct
    requested_units: int
    estimated_cost_sek: float
    audit_rationale: str
    created_at: str


class ScanResult(BaseModel):
    status: str
    code: int
    gtin: str
    lot: str
    brand_name: str
    price_sek: float
    message: str
    timestamp: str
