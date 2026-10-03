"""RecallFirebreak ERPNext Live Integration Service.

Connects to ERPNext instance at http://127.0.0.1:8003 with:
- API Key: e574dc1238cafbc
- API Secret: 169c8afd0c089c8

Provides:
- Live connection test & auth verification
- Real-time stock availability check (Stock Ledger Bins)
- Automated Purchase Order creation & staging
- Automated demo data seeding (Items, Bins, Supplier)
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

DEFAULT_BASE_URL = "http://127.0.0.1:8003"
DEFAULT_API_KEY = "e574dc1238cafbc"
DEFAULT_API_SECRET = "169c8afd0c089c8"
DEFAULT_COMPANY = "fb"
DEFAULT_WAREHOUSE = "Stores - F"
DEFAULT_SUPPLIER = "Tamro AB Sweden"


class ERPNextService:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        api_key: str = DEFAULT_API_KEY,
        api_secret: str = DEFAULT_API_SECRET,
        company: str = DEFAULT_COMPANY,
        warehouse: str = DEFAULT_WAREHOUSE,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.api_secret = api_secret
        self.company = company
        self.warehouse = warehouse

    @property
    def auth_header(self) -> str:
        return f"token {self.api_key}:{self.api_secret}"

    def _request(
        self,
        path: str,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        timeout: float = 6.0,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": self.auth_header,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)

        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
                content = resp.read().decode("utf-8")
                res_json = json.loads(content) if content else {}
                res_json["_latency_ms"] = elapsed_ms
                res_json["_status_code"] = resp.status
                return res_json
        except urllib.error.HTTPError as err:
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
            err_body = err.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(err_body)
                parsed["_latency_ms"] = elapsed_ms
                parsed["_status_code"] = err.code
                return parsed
            except Exception:
                return {
                    "error": err_body,
                    "_status_code": err.code,
                    "_latency_ms": elapsed_ms,
                }
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {
                "error": str(exc),
                "_status_code": 500,
                "_latency_ms": elapsed_ms,
            }

    def check_connection(self) -> Dict[str, Any]:
        """Verify authentication and reachability to Frappe / ERPNext."""
        res = self._request("/api/method/frappe.auth.get_logged_user")
        if res.get("message"):
            return {
                "success": True,
                "user": res.get("message"),
                "status": "CONNECTED",
                "latency_ms": res.get("_latency_ms", 25),
                "base_url": self.base_url,
                "message": f"200 OK — Connected to ERPNext as {res.get('message')}",
            }
        return {
            "success": False,
            "status": "DISCONNECTED",
            "latency_ms": res.get("_latency_ms", 0),
            "base_url": self.base_url,
            "error": res.get("error", "Authentication failed"),
        }

    def get_stock_levels(self) -> Dict[str, Any]:
        """Fetch live actual quantities from ERPNext Stock Ledger Bins."""
        fields = json.dumps(["item_code", "warehouse", "actual_qty", "valuation_rate"])
        path = f"/api/resource/Bin?fields={urllib.parse.quote(fields)}"
        res = self._request(path)

        bins_data = res.get("data", [])
        catalog_map = {
            "07350012345678": {"name": "Amimox 500mg", "atc": "J01CA04", "recall_target": True},
            "07350099999999": {"name": "Alvedon 500mg", "atc": "N02BE01", "recall_target": False},
            "TAMRO-98311-SE": {"name": "Spektramox 500mg/125mg", "atc": "J01CR02", "replacement": True},
            "TAMRO-44102-SE": {"name": "Amoxicillin Sandoz 500mg", "atc": "J01CA04", "replacement": True},
        }

        items_list = []
        for b in bins_data:
            code = b.get("item_code")
            meta = catalog_map.get(code, {"name": code})
            items_list.append({
                "item_code": code,
                "item_name": meta.get("name", code),
                "warehouse": b.get("warehouse"),
                "actual_qty": b.get("actual_qty", 0),
                "valuation_rate": b.get("valuation_rate", 0),
                "is_recall_target": meta.get("recall_target", False),
            })

        return {
            "success": True,
            "count": len(items_list),
            "items": items_list,
            "latency_ms": res.get("_latency_ms", 20),
            "source": f"{self.base_url}/api/resource/Bin",
        }

    def create_purchase_order(
        self,
        item_code: str = "TAMRO-98311-SE",
        qty: float = 5500,
        rate: float = 25.0,
        supplier: str = DEFAULT_SUPPLIER,
        schedule_date: str = "2026-10-15",
        rationale: str = "Urgent replenishment following Class 1 contamination lockout",
    ) -> Dict[str, Any]:
        """Creates a real Purchase Order in ERPNext."""
        po_payload = {
            "doctype": "Purchase Order",
            "supplier": supplier,
            "company": self.company,
            "schedule_date": schedule_date,
            "set_warehouse": self.warehouse,
            "items": [
                {
                    "item_code": item_code,
                    "qty": qty,
                    "rate": rate,
                    "uom": "Box",
                    "stock_uom": "Box",
                    "conversion_factor": 1.0,
                    "schedule_date": schedule_date,
                }
            ],
            "terms": f"Firebreak Sentinel Automated Safety Replenishment. {rationale}",
        }

        res = self._request("/api/resource/Purchase%20Order", method="POST", data=po_payload)
        po_data = res.get("data", {})
        if po_data.get("name"):
            return {
                "success": True,
                "po_id": po_data["name"],
                "supplier": po_data.get("supplier"),
                "grand_total": po_data.get("grand_total"),
                "currency": po_data.get("currency", "SEK"),
                "status": po_data.get("status", "Draft"),
                "latency_ms": res.get("_latency_ms", 35),
                "url": f"{self.base_url}/app/purchase-order/{po_data['name']}",
                "message": f"Purchase Order {po_data['name']} staged in ERPNext (Total: {po_data.get('grand_total')} SEK)",
            }

        return {
            "success": False,
            "error": res.get("error") or res.get("_server_messages") or "Failed to stage PO in ERPNext",
            "latency_ms": res.get("_latency_ms", 0),
        }

    def set_item_status(self, item_code: str, disabled: bool, comment: Optional[str] = None) -> Dict[str, Any]:
        """Updates Item disabled flag in ERPNext (0 = Enabled, 1 = Disabled / Quarantined)."""
        code = urllib.parse.quote(item_code)
        payload = {"disabled": 1 if disabled else 0}
        res = self._request(f"/api/resource/Item/{code}", method="PUT", data=payload)

        if disabled and comment:
            try:
                self._request("/api/resource/Comment", method="POST", data={
                    "comment_type": "Comment",
                    "reference_doctype": "Item",
                    "reference_name": item_code,
                    "content": comment
                })
            except Exception:
                pass

        if res.get("data"):
            status_text = "Disabled" if disabled else "Enabled"
            return {
                "success": True,
                "item_code": item_code,
                "disabled": bool(res["data"].get("disabled")),
                "status": status_text,
                "latency_ms": res.get("_latency_ms", 25),
                "message": f"ERPNext Item {item_code} status set to {status_text}",
            }
        return {
            "success": False,
            "error": res.get("error") or "Failed to update item status",
            "latency_ms": res.get("_latency_ms", 0),
        }

    def submit_purchase_order(self, po_id: str) -> Dict[str, Any]:
        """Submits a draft Purchase Order in ERPNext (docstatus: 1)."""
        clean_id = urllib.parse.quote(po_id)
        res = self._request(f"/api/resource/Purchase%20Order/{clean_id}", method="PUT", data={"docstatus": 1})
        if res.get("data"):
            return {
                "success": True,
                "po_id": po_id,
                "docstatus": 1,
                "status": res["data"].get("status", "To Receive and Bill"),
                "latency_ms": res.get("_latency_ms", 30),
                "url": f"{self.base_url}/app/purchase-order/{po_id}",
                "message": f"Purchase Order {po_id} submitted in ERPNext",
            }
        return {
            "success": False,
            "error": res.get("error") or "Failed to submit Purchase Order in ERPNext",
            "latency_ms": res.get("_latency_ms", 0),
        }

    def seed_demo_data(self) -> Dict[str, Any]:
        """Ensures all pharmaceutical items and initial warehouse stock exist in ERPNext."""
        # Check Item Group
        ig_res = self._request("/api/resource/Item%20Group/Pharmaceuticals")
        if not ig_res.get("data"):
            self._request("/api/resource/Item%20Group", method="POST", data={
                "item_group_name": "Pharmaceuticals",
                "parent_item_group": "All Item Groups",
                "is_group": 0,
            })

        # Check Supplier
        sup_res = self._request("/api/resource/Supplier/Tamro%20AB%20Sweden")
        if not sup_res.get("data"):
            self._request("/api/resource/Supplier", method="POST", data={
                "supplier_name": "Tamro AB Sweden",
                "supplier_group": "All Supplier Groups",
                "supplier_type": "Company",
                "country": "Sweden",
                "default_currency": "SEK",
            })

        # Items definition
        items_def = [
            {
                "item_code": "07350012345678",
                "item_name": "Amimox 500mg",
                "item_group": "Pharmaceuticals",
                "stock_uom": "Box",
                "is_stock_item": 1,
                "valuation_rate": 20.00,
                "standard_rate": 25.00,
                "description": "Amoxicillin 500mg capsules (ATC J01CA04). Swedish MPA recall LV-2026-0912.",
            },
            {
                "item_code": "07350099999999",
                "item_name": "Alvedon 500mg",
                "item_group": "Pharmaceuticals",
                "stock_uom": "Box",
                "is_stock_item": 1,
                "valuation_rate": 12.00,
                "standard_rate": 15.00,
                "description": "Paracetamol 500mg tablets (ATC N02BE01). Safe control reference batch.",
            },
            {
                "item_code": "TAMRO-98311-SE",
                "item_name": "Spektramox 500mg/125mg",
                "item_group": "Pharmaceuticals",
                "stock_uom": "Box",
                "is_stock_item": 1,
                "valuation_rate": 22.00,
                "standard_rate": 25.00,
                "description": "Amoxicillin / Clavulanic Acid 500mg/125mg (ATC J01CR02). Primary bioequivalent replacement.",
            },
            {
                "item_code": "TAMRO-44102-SE",
                "item_name": "Amoxicillin Sandoz 500mg",
                "item_group": "Pharmaceuticals",
                "stock_uom": "Box",
                "is_stock_item": 1,
                "valuation_rate": 18.00,
                "standard_rate": 21.50,
                "description": "Amoxicillin 500mg (ATC J01CA04). Secondary alternate.",
            },
        ]

        for item in items_def:
            code = urllib.parse.quote(item["item_code"])
            check = self._request(f"/api/resource/Item/{code}")
            if not check.get("data"):
                self._request("/api/resource/Item", method="POST", data=item)

        # Ensure stock entries in Stores - F
        bins_res = self._request('/api/resource/Bin?fields=["item_code","warehouse","actual_qty"]')
        existing_bins = {b["item_code"]: b["actual_qty"] for b in bins_res.get("data", [])}

        if existing_bins.get("07350012345678", 0) <= 0:
            stock_entry_payload = {
                "doctype": "Stock Entry",
                "stock_entry_type": "Material Receipt",
                "company": self.company,
                "to_warehouse": self.warehouse,
                "items": [
                    {
                        "item_code": "07350012345678",
                        "qty": 4560,
                        "t_warehouse": self.warehouse,
                        "basic_rate": 20.00,
                    },
                    {
                        "item_code": "07350099999999",
                        "qty": 8000,
                        "t_warehouse": self.warehouse,
                        "basic_rate": 12.00,
                    },
                ],
            }
            se_res = self._request("/api/resource/Stock%20Entry", method="POST", data=stock_entry_payload)
            se_name = se_res.get("data", {}).get("name")
            if se_name:
                self._request(f"/api/resource/Stock%20Entry/{se_name}", method="PUT", data={"docstatus": 1})

        return self.get_stock_levels()


# Global default service instance pointing to local ERPNext instance
erpnext_client = ERPNextService()
