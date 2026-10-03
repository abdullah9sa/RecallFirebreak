"""Setup and seed demo data in local ERPNext instance (http://127.0.0.1:8003).

Configures:
- Supplier: Tamro AB Sweden (SUPP-TAMRO-SE)
- Item Group: Pharmaceuticals
- Items:
    1. Amimox 500mg (GTIN 07350012345678)
    2. Alvedon 500mg (GTIN 07350099999999)
    3. Spektramox 500mg/125mg (SKU TAMRO-98311-SE, GTIN 07350087654321)
    4. Amoxicillin Sandoz 500mg (SKU TAMRO-44102-SE, GTIN 07350055443322)
- Stock Entry: Material Receipt into 'Stores - F' for initial inventory
"""

import json
import urllib.request
import urllib.parse
import sys

BASE_URL = "http://127.0.0.1:8003"
API_KEY = "e574dc1238cafbc"
API_SECRET = "169c8afd0c089c8"
AUTH_HEADER = f"token {API_KEY}:{API_SECRET}"


def api_request(path: str, method: str = "GET", data: dict = None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": AUTH_HEADER,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        print(f"HTTP Error {err.code} on {method} {path}: {err_body}")
        try:
            return json.loads(err_body)
        except Exception:
            return {"error": err_body, "code": err.code}
    except Exception as exc:
        print(f"Network error on {method} {path}: {exc}")
        return {"error": str(exc)}


def main():
    print(f"Connecting to ERPNext at {BASE_URL}...")
    user_res = api_request("/api/method/frappe.auth.get_logged_user")
    print(f"Logged in user: {user_res.get('message')}")
    if user_res.get("message") != "Administrator":
        print("Warning: Expected Administrator login, proceeding anyway.")

    # 1. Ensure Item Group 'Pharmaceuticals'
    print("\n1. Ensuring Item Group 'Pharmaceuticals'...")
    ig_check = api_request("/api/resource/Item%20Group/Pharmaceuticals")
    if "error" in ig_check or not ig_check.get("data"):
        create_ig = api_request("/api/resource/Item%20Group", "POST", {
            "item_group_name": "Pharmaceuticals",
            "parent_item_group": "All Item Groups",
            "is_group": 0
        })
        print("Created Item Group:", create_ig.get("data", {}).get("name", create_ig))
    else:
        print("Item Group 'Pharmaceuticals' already exists.")

    # 2. Ensure Supplier 'Tamro AB Sweden'
    print("\n2. Ensuring Supplier 'Tamro AB Sweden'...")
    sup_check = api_request("/api/resource/Supplier/Tamro%20AB%20Sweden")
    if "error" in sup_check or not sup_check.get("data"):
        create_sup = api_request("/api/resource/Supplier", "POST", {
            "supplier_name": "Tamro AB Sweden",
            "supplier_group": "All Supplier Groups",
            "supplier_type": "Company",
            "country": "Sweden",
            "default_currency": "SEK"
        })
        print("Created Supplier:", create_sup.get("data", {}).get("name", create_sup))
    else:
        print("Supplier 'Tamro AB Sweden' already exists.")

    # 3. Create or Update Items
    items_to_seed = [
        {
            "item_code": "07350012345678",
            "item_name": "Amimox 500mg",
            "item_group": "Pharmaceuticals",
            "stock_uom": "Box",
            "is_stock_item": 1,
            "valuation_rate": 20.00,
            "standard_rate": 25.00,
            "description": "Amoxicillin 500mg capsules (ATC J01CA04). Target of Swedish MPA recall LV-2026-0912."
        },
        {
            "item_code": "07350099999999",
            "item_name": "Alvedon 500mg",
            "item_group": "Pharmaceuticals",
            "stock_uom": "Box",
            "is_stock_item": 1,
            "valuation_rate": 12.00,
            "standard_rate": 15.00,
            "description": "Paracetamol 500mg tablets (ATC N02BE01). Safe control reference batch."
        },
        {
            "item_code": "TAMRO-98311-SE",
            "item_name": "Spektramox 500mg/125mg",
            "item_group": "Pharmaceuticals",
            "stock_uom": "Box",
            "is_stock_item": 1,
            "valuation_rate": 22.00,
            "standard_rate": 25.00,
            "description": "Amoxicillin / Clavulanic Acid 500mg/125mg (ATC J01CR02). Primary bioequivalent replacement."
        },
        {
            "item_code": "TAMRO-44102-SE",
            "item_name": "Amoxicillin Sandoz 500mg",
            "item_group": "Pharmaceuticals",
            "stock_uom": "Box",
            "is_stock_item": 1,
            "valuation_rate": 18.00,
            "standard_rate": 21.50,
            "description": "Amoxicillin 500mg (ATC J01CA04). Secondary alternate."
        }
    ]

    print("\n3. Ensuring Items...")
    for item in items_to_seed:
        code = item["item_code"]
        quoted_code = urllib.parse.quote(code)
        check = api_request(f"/api/resource/Item/{quoted_code}")
        if "error" in check or not check.get("data"):
            created = api_request("/api/resource/Item", "POST", item)
            print(f"Created Item: {code} -> {created.get('data', {}).get('name', created)}")
        else:
            print(f"Item {code} already exists.")

    # 4. Check Stock (Bins) and Seed Initial Stock if needed
    print("\n4. Checking Stock Levels...")
    bins = api_request("/api/resource/Bin?fields=[\"item_code\",\"warehouse\",\"actual_qty\"]")
    bin_map = {b["item_code"]: b["actual_qty"] for b in bins.get("data", [])}
    print("Current Bins in ERPNext:", bin_map)

    if bin_map.get("07350012345678", 0) <= 0:
        print("\nSeeding initial stock via Stock Entry (Material Receipt)...")
        stock_entry_payload = {
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": "fb",
            "to_warehouse": "Stores - F",
            "items": [
                {
                    "item_code": "07350012345678",
                    "qty": 4560,
                    "t_warehouse": "Stores - F",
                    "basic_rate": 20.00
                },
                {
                    "item_code": "07350099999999",
                    "qty": 8000,
                    "t_warehouse": "Stores - F",
                    "basic_rate": 12.00
                }
            ]
        }
        se_res = api_request("/api/resource/Stock%20Entry", "POST", stock_entry_payload)
        docname = se_res.get("data", {}).get("name")
        if docname:
            print(f"Created Stock Entry draft: {docname}. Submitting...")
            # In Frappe, docstatus=1 means submitted
            submit_res = api_request(f"/api/resource/Stock%20Entry/{docname}", "PUT", {"docstatus": 1})
            if submit_res.get("data", {}).get("docstatus") == 1:
                print(f"Stock Entry {docname} successfully submitted!")
            else:
                print("Stock Entry submit response:", submit_res)
        else:
            print("Stock Entry creation failed:", se_res)
    else:
        print("Amimox stock already present in ERPNext.")

    # 5. Verify final bins
    final_bins = api_request("/api/resource/Bin?fields=[\"item_code\",\"warehouse\",\"actual_qty\"]")
    print("\nFinal Stock Ledger Quantities:")
    for b in final_bins.get("data", []):
        print(f" - {b['item_code']} in {b['warehouse']}: {b['actual_qty']} units")


if __name__ == "__main__":
    main()
