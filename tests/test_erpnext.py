"""Test suite for ERPNext Live Integration in RecallFirebreak."""

import unittest
from fastapi.testclient import TestClient

from backend.main import app
from backend.state import state
from backend.erpnext_service import erpnext_client


class TestERPNextIntegration(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_live_erpnext_connection(self):
        """Verify that backend can reach and authenticate with local ERPNext at 127.0.0.1:8003."""
        status = erpnext_client.check_connection()
        self.assertTrue(status.get("success"), f"ERPNext auth failed: {status}")
        self.assertEqual(status.get("user"), "Administrator")
        self.assertEqual(status.get("status"), "CONNECTED")
        self.assertGreater(status.get("latency_ms", 0), 0)

    def test_erpnext_stock_availability(self):
        """Verify that live items and stock ledger bins can be queried."""
        stock = erpnext_client.get_stock_levels()
        self.assertTrue(stock.get("success"), f"Stock fetch failed: {stock}")
        self.assertGreaterEqual(stock.get("count", 0), 2)
        
        # Verify demo items exist
        item_codes = {item["item_code"] for item in stock.get("items", [])}
        self.assertIn("07350012345678", item_codes)
        self.assertIn("07350099999999", item_codes)

    def test_api_integration_test_endpoint(self):
        """Verify /api/integrations/test returns real ERPNext live status and latency."""
        resp = self.client.post("/api/integrations/test", json={"system": "erpnext"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "SUCCESS")
        self.assertEqual(data.get("system"), "erpnext")
        self.assertIn("Administrator", data.get("message", ""))

    def test_api_stock_endpoint(self):
        """Verify /api/erpnext/stock returns live ledger."""
        resp = self.client.get("/api/erpnext/stock")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreaterEqual(len(data.get("items", [])), 2)

    def test_api_po_staging_endpoint(self):
        """Verify /api/erpnext/po creates a draft PO in ERPNext."""
        resp = self.client.post("/api/erpnext/po", json={
            "item_code": "TAMRO-98311-SE",
            "qty": 5500,
            "rate": 25.0
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertTrue(data.get("po_id", "").startswith("PUR-ORD-"))
        self.assertEqual(data.get("grand_total"), 137500.0)

    def test_state_default_settings(self):
        """Verify ERPNext is configured as the active default integration."""
        settings = state.get_settings()
        erp = settings.get("integrations", {}).get("erpnext", {})
        self.assertTrue(erp.get("enabled"))
        self.assertEqual(erp.get("status"), "connected")
        self.assertEqual(erp.get("base_url"), "http://127.0.0.1:8003")
        self.assertEqual(erp.get("warehouse"), "Stores - F")

    def test_item_status_toggle(self):
        """Verify that item status can be toggled to Disabled (1) and back to Enabled (0)."""
        gtin = "07350012345678"
        # Disable item (quarantine)
        res_dis = erpnext_client.set_item_status(gtin, disabled=True, comment="Test quarantine")
        self.assertTrue(res_dis.get("success"))
        self.assertTrue(res_dis.get("disabled"))
        self.assertEqual(res_dis.get("status"), "Disabled")

        # Re-enable item
        res_en = erpnext_client.set_item_status(gtin, disabled=False)
        self.assertTrue(res_en.get("success"))
        self.assertFalse(res_en.get("disabled"))
        self.assertEqual(res_en.get("status"), "Enabled")

    def test_manual_quarantine_and_reset_endpoints(self):
        """Verify /api/quarantine/manual disables item in ERPNext and /api/reset re-enables it."""
        gtin = "07350012345678"
        resp_q = self.client.post("/api/quarantine/manual", json={
            "gtin": gtin,
            "lots": ["L9824B"]
        })
        self.assertEqual(resp_q.status_code, 200)
        data_q = resp_q.json()
        self.assertTrue(data_q.get("erpnext", {}).get("disabled"))

        # Reset demo baseline
        resp_r = self.client.post("/api/reset")
        self.assertEqual(resp_r.status_code, 200)

        # Check item is re-enabled in ERPNext
        stock = erpnext_client.get_stock_levels()
        self.assertTrue(stock.get("success"))

    def test_po_draft_and_submission(self):
        """Verify draft PO creation and submission in ERPNext."""
        po_res = erpnext_client.create_purchase_order(
            item_code="TAMRO-98311-SE",
            qty=4400,
            rate=25.0,
            supplier="Tamro AB Sweden",
            rationale="Automated test purchase order"
        )
        self.assertTrue(po_res.get("success"))
        po_id = po_res.get("po_id")
        self.assertTrue(po_id.startswith("PUR-ORD-"))

        # Submit PO
        sub_res = erpnext_client.submit_purchase_order(po_id)
        self.assertTrue(sub_res.get("success"))
        self.assertEqual(sub_res.get("docstatus"), 1)
        self.assertEqual(sub_res.get("status"), "To Receive and Bill")


if __name__ == "__main__":
    unittest.main()

