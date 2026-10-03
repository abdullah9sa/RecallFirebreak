import threading
from typing import Set, Tuple, List, Dict, Optional


class GlobalStateStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with self._lock:
            # Set of (gtin, lot_number) tuples currently blocked
            self._quarantined: Set[Tuple[str, str]] = set()
            
            # Karolinska University Hospital initial stock baseline
            self._total_units: int = 5200
            self._quarantined_units: int = 0
            self._daily_burn_rate: float = 400.0  # units consumed per day
            self._baseline_days: float = 11.4     # 4560 usable / 400 = 11.4 days
            self._current_days: float = 11.4
            
            # Staged POs awaiting human approval
            self._staged_pos: List[Dict] = []
            
            # Last bulletin processed telemetry
            self._last_bulletin: Optional[Dict] = None

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

    def apply_quarantine_inventory_drop(self, quarantined_count: int = 4500) -> Dict:
        with self._lock:
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


# Global singleton instance
state = GlobalStateStore()
