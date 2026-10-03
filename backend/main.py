"""RecallFirebreak API.

  GET  /api/health
  GET  /api/state                      current inventory / quarantine / POs
  POST /api/pos/scan?gtin=&lot=        point-of-sale check (HTTP 423 when blocked)
  GET|POST /api/bulletin/ingest        SSE stream of agent events
        ?type=class1|class3            built-in sample bulletins
        POST body {"text": "..."}      or an arbitrary bulletin
  POST /api/po/approve?po_id=          human approval of a staged PO
  POST /api/reset                      back to the clean demo baseline
"""
import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import load_bulletin, run_agent
from .state import state
from .tools import DATA_DIR

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
DEFAULT_PRICE_SEK = 145.00

app = FastAPI(title="RecallFirebreak")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_run_lock = asyncio.Lock()  # one agent run at a time keeps the demo state coherent


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _product_name(gtin: str) -> Optional[str]:
    inv = json.loads((DATA_DIR / "inventory.json").read_text(encoding="utf-8"))
    for node in inv["hospital_nodes"]:
        for item in node["inventory"]:
            if item["gtin"] == gtin:
                return item["brand_name"]
    return None


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": _now()}


@app.get("/api/state")
async def get_state():
    return {
        "inventory": state.get_inventory_status(),
        "quarantined": state.get_quarantined_items(),
        "purchase_orders": state.get_staged_pos(),
    }


@app.api_route("/api/pos/scan", methods=["GET", "POST"])
async def pos_scan(gtin: str, lot: str):
    gtin, lot = gtin.strip(), lot.strip()
    brand = _product_name(gtin) or "Unknown product"
    base = {"gtin": gtin, "lot": lot, "brand_name": brand, "timestamp": _now()}
    if state.is_quarantined(gtin, lot):
        return JSONResponse(
            status_code=423,
            content={**base, "status": "DISPENSE_BLOCKED", "code": 423, "price_sek": 0.0,
                     "message": "CRITICAL HAZARD: this batch is quarantined under a regulatory recall."},
        )
    return {**base, "status": "APPROVED", "code": 200, "price_sek": DEFAULT_PRICE_SEK,
            "message": "Valid for customer dispensing."}


@app.api_route("/api/bulletin/ingest", methods=["GET", "POST"])
async def ingest(request: Request, type: Optional[str] = None):
    text: Optional[str] = None
    if type in ("class1", "class3"):
        text = load_bulletin(type)
    elif request.method == "POST":
        body = await request.body()
        try:
            text = json.loads(body).get("text") if body else None
        except (json.JSONDecodeError, AttributeError):
            text = body.decode("utf-8", errors="ignore") or None
    if not text or not text.strip():
        raise HTTPException(400, "Provide ?type=class1|class3 or a POST body with the bulletin text.")
    if _run_lock.locked():
        raise HTTPException(409, "An agent run is already in progress.")

    async def stream():
        async with _run_lock:
            t0 = time.perf_counter()
            yield _sse({"type": "started", "bulletin": type or "custom", "t_ms": 0})
            try:
                async for ev in run_agent(text):
                    ev["t_ms"] = int((time.perf_counter() - t0) * 1000)
                    yield _sse(ev)
            except Exception as exc:  # surfaced to the UI; Milestone 5 adds the offline fallback
                yield _sse({"type": "error", "message": str(exc)[:300],
                            "t_ms": int((time.perf_counter() - t0) * 1000)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/po/approve")
async def approve_po(po_id: str):
    po = state.approve_po(po_id)
    if po is None:
        raise HTTPException(404, f"No staged purchase order {po_id}")
    return {"status": "APPROVED", "po": po, "inventory": state.get_inventory_status()}


@app.post("/api/reset")
async def reset():
    state.reset()
    return {"status": "RESET", "inventory": state.get_inventory_status()}


# Static frontend (Milestone 4). Mounted last so /api/* wins.
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
