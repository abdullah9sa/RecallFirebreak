# RecallFirebreak: 6-Hour Hackathon Design (`design.md`)

## 1. Pitch

**RecallFirebreak** is an autonomous agent that reads an unstructured drug-recall bulletin (Läkemedelsverket style), **locks the affected batches at the point of sale**, checks hospital inventory, finds a substitute drug via the ATC classification, and **drafts a purchase order for one-click human approval**.

Why it fits the hackathon:
* **Agentic**: Gemini runs a tool-calling loop and decides what to do, rather than following a fixed pipeline. Severity decides whether it locks, escalates or only flags.
* **Safety-critical, so guardrails**: Pydantic-validated extraction, a retry on malformed output, and a human approves the PO.
* **Partner integrations**: Gemini (DeepMind) through Condense as the LLM gateway (side prize). Matrix OS hosts it if time allows (side prize).

Out of scope for the hackathon (a pitch line only): the generic "BreakChain" horizontal engine, EDI integration, real POS hardware, sub-second SLA claims.

---

## 2. Architecture

One FastAPI process, in-memory state, and one static page.

```
Bulletin text/PDF ──► Agent loop (Gemini via Condense, tool calling)
                         tools:
                          1. extract_recall(text)          → ExtractedRecall (Pydantic, validated)
                          2. lock_items(gtin, lots)        → blocklist + SSE push to POS panel
                          3. get_inventory(node)           → mock JSON
                          4. find_substitutes(atc_code)    → mock ATC + stock JSON
                          5. draft_purchase_order(...)     → PO card + rationale
                         │
        SSE stream (agent steps) ──► Single-page UI
                                      ├─ Left:  POS panel (scan boxes → green / red lockout)
                                      └─ Right: agent trace, inventory bar, PO approve button
```

### Decisions vs. the earlier design

| Earlier | Now | Why |
| --- | --- | --- |
| Fixed pipeline, LLM only extracts | Tool-calling agent loop | The task is to build an agent |
| WebSocket hub, 2 event buses | One SSE stream | Simpler, and `EventSource` is trivial |
| Two separate screens | One page, two panels | Half the frontend work |
| Condense as a separate layer | Condense as the OpenAI-compatible base URL | One config switch, with fallback |
| Full ATC tree + ranking formula | Handwritten substitution JSON (4–5 drugs) | No data sourcing time |
| SQLite/Postgres + Docker | In-memory dict | Nothing to set up |
| 1.5s SLA claim | Show the measured latency in the UI | Honest and still impressive |

---

## 3. Data Contracts & State

### 3.1. Extraction (Pydantic v2)

```python
from pydantic import BaseModel, Field
from typing import List, Literal

class ExtractedRecall(BaseModel):
    bulletin_id: str
    substance: str
    brand_name: str
    atc_code: str = Field(pattern=r"^[A-Z]\d{2}[A-Z]{2}\d{2}$")
    gtin: str = Field(pattern=r"^\d{14}$")
    lot_numbers: List[str] = Field(min_length=1)
    hazard_class: Literal["CLASS_I", "CLASS_II", "CLASS_III"]
    recall_reason: str
```

Validation failure → feed the error back to the model and retry once, then fall back to the fixture.

### 3.2. Agent Policy (System Prompt Differential Logic)

The agent dynamically decides actions based on hazard classification:
* **CLASS_I (Critical Life Threat / Toxic Contamination)** or **CLASS_II**:
  1. Call `lock_items(gtin, lot_numbers)` immediately (triggers edge kill-switch).
  2. Call `get_inventory(node_id)` to evaluate regional hospital reserve.
  3. If reserve drops $\le 4$ days, call `find_substitutes(atc_code)`.
  4. Call `draft_purchase_order(...)` for emergency replenishment.
* **CLASS_III (Minor Defect / Packaging & Label Print Error)**:
  1. **Do NOT engage kill-switch**.
  2. Log an audit notification for warehouse inspection at next routine cycle.
  3. Rationale: Avoids inducing artificial regional drug shortages over non-clinical flaws.
* **Safety Rule**: The agent drafts purchase orders but **never auto-executes financial orders**. Human approval is mandatory.

### 3.3. State Management & Reset Contract

```python
# In-memory thread-safe state (state.py)
quarantined_items: set[tuple[str, str]] = set()  # (gtin, lot)
current_inventory_days: float = 11.4
staged_purchase_orders: list[dict] = []
```

* **`POST /api/reset`**: Clears quarantined items, resets Karolinska inventory to 11.4 days, and wipes staged POs. Allows instant repeated live judging demos without server restarts.

### 3.4. SSE Events

```json
{"type": "tool_call",   "tool": "lock_items", "args": {"gtin": "07350012345678", "lots": ["L9824B"]}}
{"type": "tool_result", "tool": "lock_items", "result": {"locked_count": 1}}
{"type": "lockout",     "gtin": "07350012345678", "lots": ["L9824B"], "message": "CRITICAL RECALL: Particulate contamination"}
{"type": "inventory",   "node": "Karolinska University Hospital", "days_before": 11.4, "days_after": 3.2}
{"type": "po_draft",    "po": { ... }}
{"type": "done",        "elapsed_ms": 1150, "condense_stats": {"tokens_in": 1840, "tokens_compacted": 410, "savings_pct": 77.7}}
```

---

## 4. Logic

**Run-rate**: `days_remaining = (on_hand - quarantined) / avg_daily_use`. If `<= 4`, urgent. Order `(14 - days_remaining) * avg_daily_use`.

**Substitute**: look up `substitutes.json[atc_code]`. Prefer the same ATC code from another manufacturer, then the related group. Pick the candidate with stock and the shortest lead time. No complex multi-variable weighted formula.

---

## 5. Repository Layout

```
RecallFirebreak/
├── backend/
│   ├── main.py            # FastAPI: /ingest (SSE), /scan, /po/approve, /reset, static files
│   ├── agent.py           # tool-calling loop + system prompt + fallback fixture
│   ├── tools.py           # the 5 tools (lock_items, get_inventory, find_substitutes, etc.)
│   ├── models.py          # Pydantic v2 schemas
│   ├── state.py           # In-memory blocklist, inventory state, PO records
│   ├── data/
│   │   ├── inventory.json                  # Karolinska & Tamro baseline stock
│   │   ├── substitutes.json                # Pre-mapped ATC substitution graph (Amoxicillin)
│   │   ├── bulletin_amoxicillin_class1.txt # Critical contamination fixture
│   │   ├── bulletin_alvedon_class3.txt     # Minor packaging misprint fixture
│   │   └── fixture_extraction.json         # Emergency offline fallback
│   └── requirements.txt
├── frontend/
│   ├── index.html         # Unified split-screen clinical dashboard
│   ├── app.js             # EventSource listener, scan handlers, Web Audio synthesis
│   └── styles.css         # Clinical Light Mode design tokens
└── README.md
```

---

## 6. UI Design: Unified Clinical Light Mode

**Design Philosophy**: Pure light mode throughout. Sterile, utilitarian, high-trust clinical software (reminiscent of modern Nordic hospital systems like Epic / Apoteket and clean toolkits like Linear). Zero neon distractions, zero heavy dark-mode clutter. Maximum clarity on projector screens and laptops alike.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL BAR: ● SENTINEL ONLINE | Condense: -77% tokens (120ms) | Lockout: 32ms | [↺ Reset] [🔊 Sound]│
├─────────────────────────────────────────┬────────────────────────────────────────────────────────┤
│  PANEL 1: FRONTLINE DISPENSARY REGISTER │  PANEL 2: SENTINEL SURVEILLANCE & PROCUREMENT          │
│  (Hospital Point-of-Care Simulator)     │  (Autonomous Regulatory Agent & Command Desk)          │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ • Barcode Scan Deck (3 drug cards)      │ • Intake: [⚠ Load Class 1] & [ℹ Load Class 3] Buttons  │
│ • Laser sweep animation + scan beep     │ • Live Agent Trace (Chronological tool calls & schema) │
│ • Itemized receipt ledger               │ • Inventory Burndown Bar (11.4d -> 3.2d warning)       │
│ • [CLIMAX] 423 DISPENSE_BLOCKED modal   │ • Staged PO Card + One-Click Human Approval            │
│   (Crimson border flash + buzzer)       │ • Audit Trail Rationale                                │
└─────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### 6.1. Visual Identity & Foundations
* **Background**: Surgical clean light grey / off-white (`#F8FAFC`).
* **Surface Containers**: Pure white (`#FFFFFF`) with crisp 1px borders (`#E2E8F0` / `#CBD5E1`) and subtle soft shadow (`0 1px 3px rgba(0,0,0,0.05)`).
* **Typography**:
  * UI & Headings: Crisp Swiss sans-serif (`Inter`, system UI stack).
  * Barcodes, Lot IDs, GTINs & Telemetry: Precision monospaced font (`JetBrains Mono` or `IBM Plex Mono`).
* **Color System**:
  * **Neutral Base**: Clinical slate (`#0F172A` text, `#475569` muted labels, `#E2E8F0` borders).
  * **Approved State**: Crisp emerald (`#059669`) with soft mint fill (`#ECFDF5`, border `#A7F3D0`).
  * **Depletion / Warning State**: Warm amber (`#D97706`) with light amber fill (`#FEF3C7`).
  * **Critical Lockout (The Demo Climax)**: High-contrast saturated crimson (`#DC2626`) with soft rose backing (`#FEF2F2`).

---

### 6.2. Global Navigation & Telemetry Ribbon
* **Status**: Pulsating emerald indicator labeled `● SENTINEL_DAEMON_ACTIVE`.
* **Condense Side-Prize Telemetry Chip**: 
  `Condense.chat Compaction: 1,840 → 410 tokens (-77%) | 120ms`
* **Latency Counter**: `Broadcast: 32ms | Total Pipeline: 1.15s`
* **Interactive Utility Controls**:
  * `[ ↺ Reset Demo ]`: One-click instant state wipe via `POST /api/reset`.
  * `[ 🔊 Sound: ON/OFF ]`: Toggle for audio effects; unlocks the browser Web Audio context on initial user click.

---

### 6.3. Left Panel: The Frontline Register ("Clinical Terminal Minimal")
**Vibe**: Utilitarian, sterile hospital dispensary register.

* **Medication Barcode Deck**:
  * 3 interactive medication cards with rendered GS1 DataMatrix / 1D barcodes and high-clarity labels:
    * **Box A**: `Amimox 500mg (Safe Lot)` — GTIN `07350012345678` · Lot `L1100A` · Exp `2027-08`
    * **Box B (Target)**: `Amimox 500mg (Recalled Lot)` — GTIN `07350012345678` · Lot `L9824B` · Exp `2026-11`
    * **Box C**: `Alvedon 500mg (Control / Class 3)` — GTIN `07350099999999` · Lot `P4401Z` · Exp `2028-02`
  * **Laser Scan Interaction**:
    * Clicking any card or scan button triggers a sharp red laser scan line sweep (`180ms` CSS animation) and an authentic short POS beep via Web Audio API.
* **Itemized Receipt Ledger**:
  * Monospaced table showing recent scans, timestamp, price (`145.00 SEK`), and emerald `APPROVED` badge.
* **The Lockout State (The Climax)**:
  * When **Box B** is scanned after quarantine is active:
    * Immediate red perimeter pulse on the register panel.
    * Modal alert:
      ```
      [ 423 DISPENSE_BLOCKED ]
      CRITICAL RECALL: Läkemedelsverket Order #LV-2026-0912
      GTIN: 07350012345678 | LOT: L9824B
      ACTION: Immediate Quarantine — Retain in Red Hazard Bin.
      ```
    * Two-tone Web Audio alarm buzzer.

---

### 6.4. Right Panel: Sentinel Command Desk ("Clinical Surveillance Minimal")
**Vibe**: High-trust regulatory intelligence desk in clean light mode (no distracting dark-mode neon).

* **Regulatory Intake Zone**:
  * Clean drag-and-drop zone: *"Drop Regulatory Bulletin (PDF or TXT)"*.
  * **Differential Demo Triggers (The Agentic Proof)**:
    1. **[ ⚠ Load Class 1: Amimox Contamination ]**: Toxic defect triggers kill-switch lockout and emergency PO.
    2. **[ ℹ Load Class 3: Alvedon Label Misprint ]**: Minor packaging error logs audit warning without locking POS.
* **Live Autonomous Agent Trace**:
  * Clean chronological feed showing Gemini's tool calls and Pydantic validation:
    1. `tool_call: extract_recall` $\to$ Parsed GTIN `07350012345678`, Lot `L9824B`, Severity `CLASS_I`.
    2. `tool_call: lock_items` $\to$ Blocklist updated; SSE kill-switch event broadcast to POS.
    3. `tool_call: get_inventory` $\to$ Queried Karolinska University Hospital stock.
    4. `tool_call: find_substitutes` $\to$ Traversed ATC `J01CA04` $\to$ Selected `J01CR02` (Spektramox).
    5. `tool_call: draft_purchase_order` $\to$ Staged PO-2026-0912 with clinical justification.
* **Hospital Inventory Run-Rate Gauge**:
  * Stock burndown bar for Karolinska Hospital:
    * Pre-recall: `11.4 days` (healthy slate/green bar).
    * Post-recall: Drops to `3.2 days` (warning amber/red bar with tag `CRITICAL: < 4 DAYS BUFFER`).
* **Auto-Requisition Staging Card**:
  * High-clarity order card:
    * **Substitute Product**: Spektramox 500mg/125mg (`J01CR02`) via Tamro AB Sweden.
    * **Units Needed**: `4,400 units` (110,000 SEK) to restore 14-day regional buffer. Computed, not hardcoded: `(14 - 3.2) x 400/day`, rounded up to 100.
    * **Safety Rationale**: *"Batch L9824B quarantined. Bioequivalent substitute available locally with 12h delivery SLA."*
  * **Human-in-the-Loop Action**:
    * Clean, bold button: **[ Approve & Transmit Purchase Order ]**.
    * On click: Transitions to a calm green badge: *"✓ PO-2026-0912 Approved and Dispatched to Tamro AB"*.

---

## 7. Build Plan (6 hours)

| Time | Deliverable |
| --- | --- |
| 0:00–0:45 | Mock JSON data (`inventory.json`, `substitutes.json`), Pydantic models, sample bulletins |
| 0:45–2:15 | Agent loop with 5 tools, running from CLI against Gemini through Condense |
| 2:15–3:30 | FastAPI `/ingest` (SSE), `/scan`, `/reset`, in-memory blocklist |
| 3:30–5:00 | One-page UI: POS panel, trace, inventory bar, PO card, Condense badge, reset button |
| 5:00–5:30 | Fallback fixture, error handling, Matrix OS deploy if easy |
| 5:30–6:00 | Rehearse 3 times, README, pitch |

**Cut order if behind**: Matrix OS deploy → PO approve animation → inventory chart → PDF upload (keep the text buttons). **Never cut**: the lockout and the live agent trace.

**Fallback**: if the LLM call fails or times out, replay `fixture_extraction.json` and the pre-recorded trace so the demo keeps working.

---

## 8. Demo Script (2 minutes)

1. **Baseline Scan**: Scan Box B (Amimox) $\to$ Green check, cash register chime (`APPROVED: 145.00 SEK`).
2. **Autonomous Reasoning Proof (Class 3 Test)**:
   - Click **[ ℹ Load Class 3: Alvedon Label Misprint ]**.
   - Watch the agent trace stream: The agent inspects the bulletin and states: *"Class 3 defect is non-toxic packaging misprint; no POS lockout engaged; inventory untouched."*
   - Scan Box C $\to$ Still approved. (Judges see it's a real thinking agent, not a blunt script).
3. **Critical Hazard Engagement (Class 1 Test)**:
   - Click **[ ⚠ Load Class 1: Amimox Contamination ]**.
   - Watch the agent trace stream:
     - `extract_recall` $\to$ Pydantic validates `CLASS_I_CRITICAL`.
     - `lock_items` $\to$ Kill-switch deployed to registers.
     - `get_inventory` $\to$ Karolinska stock drops from 11.4 to 3.2 days.
     - `find_substitutes` $\to$ Matches bioequivalent Spektramox (`J01CR02`).
     - `draft_purchase_order` $\to$ PO generated.
4. **The Physical Lockout**:
   - Rescan Box B $\to$ Full crimson perimeter flash, modal: `423 DISPENSE_BLOCKED`, synthetic warning buzzer.
5. **Human-in-the-Loop Procurement**:
   - Point to the auto-staged PO and clinical rationale.
   - Click **[ Approve & Transmit Purchase Order ]** $\to$ Confirmed dispatched to Tamro AB.
6. **Point to Condense Telemetry**:
   - *"Condense compacted the regulatory bulletin by 77%, cutting latency under 1.2s."*
7. **Reset for Next Judges**:
   - Click **[ ↺ Reset Demo ]** $\to$ Everything reverts to clean baseline in 100ms.
8. **Closing Hook**:
   - *"The exact same agent architecture protects aerospace parts, food safety, and critical infrastructure."*