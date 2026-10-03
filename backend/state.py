import json
import threading
from typing import Set, Tuple, List, Dict, Optional


class GlobalStateStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._default_settings = {
            "automation_level": "assisted",  # "notify", "assisted", "full-auto"
            "edge_latency_sla_ms": 50,
            "critical_buffer_days": 4.0,
            "target_replenishment_days": 14.0,
            "sound_enabled": True,
            "emails": [
                {"id": "1", "name": "Chief Pharmacist", "email": "chief.pharmacist@regionstockholm.se", "scope": "all", "role": "Head of Clinical Pharmacy"},
                {"id": "2", "name": "Hospital Safety Officer", "email": "safety.officer@karolinska.se", "scope": "class1", "role": "Toxicological Surveillance"},
                {"id": "3", "name": "Procurement Director", "email": "procurement@karolinska.se", "scope": "orders", "role": "Supply Chain & PO Authorizer"},
            ],
            "email_gateway": {
                "smtp_host": "mailrelay.regionstockholm.se",
                "smtp_port": 587,
                "sender": "sentinel@recallfirebreak.regionstockholm.se",
                "tls": True
            },
            "notifications": {
                "slack": {
                    "enabled": True,
                    "webhook_url": "https://hooks.slack.com/services/T00/B00/XXXX",
                    "channel": "#pharmacy-safety",
                    "events": ["class1_lockout", "po_approved", "low_stock"]
                },
                "teams": {
                    "enabled": True,
                    "webhook_url": "https://outlook.office.com/webhook/region-stockholm-desk",
                    "channel": "Hospital Emergency Incident Desk",
                    "events": ["class1_lockout", "po_approved"]
                },
                "pagerduty": {
                    "enabled": True,
                    "service_key": "PGR-SEC-9812",
                    "on_call_phone": "+46 8 123 4567"
                }
            },
            "integrations": {
                "sap": {
                    "name": "SAP S/4HANA",
                    "enabled": True,
                    "status": "connected",
                    "type": "Hospital Enterprise ERP",
                    "endpoint": "https://api.recallfirebreak.regionstockholm.se/v1/integrations/sap/requisitions",
                    "client_id": "SAP-CL-98124",
                    "company_code": "1000",
                    "contract": "PO created as Purchase Requisition via SAP BAPI / OData. Human approval required."
                },
                "erpnext": {
                    "name": "ERPNext Healthcare & Pharmacy",
                    "enabled": True,
                    "status": "connected",
                    "type": "Healthcare & Pharmacy ERP (Local Instance)",
                    "endpoint": "http://127.0.0.1:8003/api/resource/Purchase%20Order",
                    "base_url": "http://127.0.0.1:8003",
                    "api_key": "e574dc1238cafbc",
                    "api_secret": "169c8afd0c089c8",
                    "company": "fb",
                    "warehouse": "Stores - F",
                    "supplier": "Tamro AB Sweden",
                    "contract": "Live ERPNext REST API. Stock ledger balance query, batch quarantine & instant purchase order dispatch."
                },
                "oracle": {
                    "name": "Oracle Health (Cerner)",
                    "enabled": False,
                    "status": "standby",
                    "type": "Clinical EHR Supply Chain",
                    "endpoint": "https://cerner.regionstockholm.se/v1/supply",
                    "contract": "Automated replenishment requisitions interfaced with Cerner Millennium."
                },
                "dynamics": {
                    "name": "Microsoft Dynamics 365",
                    "enabled": False,
                    "status": "standby",
                    "type": "D365 SCM Healthcare",
                    "endpoint": "https://dynamics.regionstockholm.se/api/v1/orders",
                    "contract": "Integrated with Dynamics Supply Chain Management."
                },
                "apoteket_pos": {
                    "name": "Apoteket POS Mesh",
                    "enabled": True,
                    "status": "connected",
                    "type": "National Pharmacy POS",
                    "endpoint": "wss://edge.recallfirebreak.regionstockholm.se/v1/pos/mesh",
                    "contract": "Real-time edge broadcast of zero-trust lockouts with sub-50ms SLA."
                },
                "generic_gs1": {
                    "name": "Generic GS1 POS",
                    "enabled": True,
                    "status": "connected",
                    "type": "GS1 Digital Link Protocol",
                    "endpoint": "https://api.recallfirebreak.regionstockholm.se/v1/gs1/lockout",
                    "contract": "GS1 standard Digital Link URI interception."
                },
                "condense": {
                    "name": "Condense.chat Proxy & Gateway",
                    "enabled": True,
                    "status": "connected",
                    "type": "Context Compression & Token Optimization Gateway",
                    "api_key": "ck_sub_ragSH",
                    "endpoint": "https://api.condense.chat/openai/v1",
                    "model": "Adeline-1 Context Compactor",
                    "contract": "Prunes redundant regulatory boilerplate while preserving 100% of critical clinical safety facts."
                }
            }
        }
        self._settings = json.loads(json.dumps(self._default_settings))
        self.reset()

    def reset(self):
        with self._lock:
            # Set of (gtin, lot_number) tuples currently blocked
            self._quarantined: Set[Tuple[str, str]] = set()
            
            # Karolinska University Hospital initial stock baseline
            self._total_units: int = 4560
            self._quarantined_units: int = 0
            self._daily_burn_rate: float = 400.0  # units consumed per day
            self._baseline_days: float = 11.4     # 4560 units / 400 per day = 11.4 days
            self._current_days: float = 11.4
            
            # Staged POs awaiting human approval
            self._staged_pos: List[Dict] = []
            
            # Last bulletin processed telemetry
            self._last_bulletin: Optional[Dict] = None

            # Condense Context Compactor Telemetry (Before & After Stats)
            self._condense_telemetry: Optional[Dict] = None

    def set_condense_telemetry(self, stats: Dict):
        with self._lock:
            self._condense_telemetry = stats

    def get_condense_telemetry(self) -> Optional[Dict]:
        with self._lock:
            return self._condense_telemetry

    def add_to_quarantine(self, gtin: str, lot_numbers: List[str]) -> int:
        with self._lock:
            added = 0
            for lot in lot_numbers:
                key = (gtin.strip(), lot.strip())
                if key not in self._quarantined:
                    self._quarantined.add(key)
                    added += 1
            return added

    def is_quarantined(self, gtin: str, lot: str) -> bool:
        with self._lock:
            return (gtin.strip(), lot.strip()) in self._quarantined

    def get_quarantined_items(self) -> List[Dict[str, str]]:
        with self._lock:
            return [{"gtin": k[0], "lot": k[1]} for k in self._quarantined]

    def remove_from_quarantine(self, gtin: str, lot: Optional[str] = None) -> int:
        with self._lock:
            gtin_clean = gtin.strip()
            if lot:
                key = (gtin_clean, lot.strip())
                if key in self._quarantined:
                    self._quarantined.remove(key)
                    return 1
                return 0
            else:
                to_remove = [k for k in self._quarantined if k[0] == gtin_clean]
                for k in to_remove:
                    self._quarantined.remove(k)
                return len(to_remove)

    def apply_quarantine_inventory_drop(
        self,
        quarantined_count: int = 3280,
        total_units: Optional[int] = None,
        daily_burn: Optional[float] = None,
    ) -> Dict:
        with self._lock:
            if total_units is not None:
                self._total_units = total_units
            if daily_burn is not None:
                self._daily_burn_rate = daily_burn
            self._quarantined_units = quarantined_count
            usable_units = max(0, self._total_units - self._quarantined_units)
            self._current_days = round(usable_units / self._daily_burn_rate, 1)
            return {
                "node_id": "HOSP-01-KAROLINSKA",
                "hospital_name": "Karolinska University Hospital Solna",
                "total_units": self._total_units,
                "quarantined_units": self._quarantined_units,
                "usable_units": usable_units,
                "daily_burn_rate": self._daily_burn_rate,
                "days_remaining": self._current_days,
                "baseline_days": self._baseline_days,
                "status": "CRITICAL_DEFICIT" if self._current_days <= 4.0 else "NOMINAL"
            }

    def get_inventory_status(self) -> Dict:
        with self._lock:
            usable_units = max(0, self._total_units - self._quarantined_units)
            return {
                "node_id": "HOSP-01-KAROLINSKA",
                "hospital_name": "Karolinska University Hospital Solna",
                "total_units": self._total_units,
                "quarantined_units": self._quarantined_units,
                "usable_units": usable_units,
                "daily_burn_rate": self._daily_burn_rate,
                "days_remaining": self._current_days,
                "baseline_days": self._baseline_days,
                "status": "CRITICAL_DEFICIT" if self._current_days <= 4.0 else "NOMINAL"
            }

    def stage_po(self, po: Dict):
        with self._lock:
            self._staged_pos.append(po)

    def get_staged_pos(self) -> List[Dict]:
        with self._lock:
            return list(self._staged_pos)

    def approve_po(self, po_id: str) -> Optional[Dict]:
        with self._lock:
            for po in self._staged_pos:
                if po.get("po_id") == po_id:
                    po["status"] = "TRANSMITTED_TO_TAMRO"
                    # Approving PO guarantees supply recovery to 14 days
                    self._current_days = 14.0
                    return po
            return None

    def get_settings(self) -> Dict:
        with self._lock:
            return json.loads(json.dumps(self._settings))

    def update_settings(self, updates: Dict) -> Dict:
        with self._lock:
            # Recursive or top-level dictionary merge
            for key, val in updates.items():
                if isinstance(val, dict) and key in self._settings and isinstance(self._settings[key], dict):
                    self._settings[key].update(val)
                else:
                    self._settings[key] = val
            return json.loads(json.dumps(self._settings))

    def reset_settings(self) -> Dict:
        with self._lock:
            self._settings = json.loads(json.dumps(self._default_settings))
            return json.loads(json.dumps(self._settings))


# Global singleton instance
state = GlobalStateStore()
