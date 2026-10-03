# RecallFirebreak: Implementation Milestones (`MILESTONES.md`)

This roadmap defines the sequential development, verification, and testing milestones for building RecallFirebreak within the 6-hour hackathon window.

---

## Progress Overview

| Milestone | Target Time | Focus Area | Status |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | 0:00 – 0:45 | Foundation: Mock Data, Pydantic Models & State | `[x] Completed` |
| **Milestone 2** | 0:45 – 2:15 | Autonomous Core: Tools & Gemini Agent CLI Loop | `[x] Completed` |
| **Milestone 3** | 2:15 – 3:30 | Backend API: FastAPI Server, SSE Pipeline & Reset | `[x] Completed` |
| **Milestone 4** | 3:30 – 5:00 | Frontend: Split-Screen Clinical UI & Web Audio | `[x] Completed` |
| **Milestone 5** | 5:00 – 6:00 | Hardening: Fallback Fixture, Rehearsals & Pitch | `[ ] Not Started` |

---

## Detailed Milestone Specifications

### Milestone 1: Foundation (Data, Models, State)
* **Goal**: Establish the mock environment, data contracts, and in-memory state models.
* **Deliverables**:
  - `backend/requirements.txt`: Dependencies (`fastapi`, `uvicorn`, `pydantic>=2.0`, `httpx`, `google-genai` / `openai` SDK).
  - `backend/models.py`: Pydantic v2 schemas (`ExtractedRecall`, `HazardSeverity`, `PurchaseOrderDraft`).
  - `backend/state.py`: Thread-safe in-memory store for quarantined items, inventory days, and staged POs.
  - `backend/data/inventory.json`: Karolinska Hospital baseline stock (11.4 days) and Tamro AB wholesale stock.
  - `backend/data/substitutes.json`: WHO ATC hierarchy mapping `J01CA04` $\to$ `J01CR02` (Spektramox).
  - `backend/data/bulletin_amoxicillin_class1.txt`: Realistic Läkemedelsverket Class 1 contamination bulletin.
  - `backend/data/bulletin_alvedon_class3.txt`: Realistic Class 3 harmless packaging misprint bulletin.
* **Verification Command**:
  ```bash
  python3 -c "from backend.models import ExtractedRecall; from backend.state import state; print('✓ Milestone 1 models and state imported successfully')"
  ```
* **Acceptance Criteria**:
  - Pydantic models validate sample JSON payloads without errors.
  - State methods (`add_quarantine`, `is_quarantined`, `reset_state`) execute correctly in Python.

---

### Milestone 2: Autonomous Core (Tools & Agent Loop)
* **Goal**: Build the autonomous Gemini agent loop with tool-calling and verify differential reasoning directly from the CLI.
* **Deliverables**:
  - `backend/tools.py`: 5 callable agent tools:
    1. `extract_recall`: Validates unstructured bulletin into `ExtractedRecall`.
    2. `lock_items`: Mutates blocklist and issues edge lockout.
    3. `get_inventory`: Queries hospital stock run-rate.
    4. `find_substitutes`: Traverses ATC substitution graph for available stock.
    5. `draft_purchase_order`: Builds PO with clinical justification.
  - `backend/agent.py`: Tool-calling loop with system prompt enforcing differential policy:
    - Class 1 $\to$ Immediate lockout + inventory check + substitute search + emergency PO.
    - Class 3 $\to$ Inspection audit log only; strictly refuses to lock POS or trigger emergency PO.
* **Verification Command**:
  ```bash
  python3 -m backend.agent --test
  ```
* **Acceptance Criteria**:
  - CLI runs both bulletins and prints structured agent trace logs.
  - Class 1 test produces a staged PO for Spektramox and locks Lot `L9824B`.
  - Class 3 test confirms zero lockouts and logs non-critical reasoning.

---

### Milestone 3: Backend API (FastAPI, SSE & Endpoints)
* **Goal**: Expose the agent and state store via clean REST and Server-Sent Events (SSE) endpoints.
* **Deliverables**:
  - `backend/main.py`:
    - `POST /api/pos/scan`: Checks barcode against in-memory blocklist (returns `200 APPROVED` or `423 DISPENSE_BLOCKED`).
    - `POST /api/bulletin/ingest`: Accepts bulletin text or type (`class1`/`class3`) and streams agent step events over SSE (`StreamingResponse(..., media_type="text/event-stream")`).
    - `POST /api/po/approve`: Transitions PO from `AWAITING_APPROVAL` to `TRANSMITTED_TO_TAMRO`.
    - `POST /api/reset`: Wipes quarantined items and resets inventory to 11.4 days.
    - Static file serving for `frontend/`.
* **Verification Commands**:
  ```bash
  # In terminal 1:
  uvicorn backend.main:app --port 8000

  # In terminal 2:
  curl "http://localhost:8000/api/pos/scan?gtin=07350012345678&lot=L9824B"
  curl -N -X POST "http://localhost:8000/api/bulletin/ingest?type=class1"
  curl -X POST "http://localhost:8000/api/reset"
  ```
* **Acceptance Criteria**:
  - `/api/bulletin/ingest` streams formatted SSE frames in real time.
  - `/api/pos/scan` reflects blocklist state changes immediately.
  - `/api/reset` returns system to baseline.

---

### Milestone 4: Frontend (Split-Screen Clinical UI & Audio)
* **Goal**: Build a high-trust, responsive Clinical Light Mode interface with real-time SSE listening and Web Audio feedback.
* **Deliverables**:
  - `frontend/index.html`: Two-panel clinical layout (Left: Register POS | Right: Sentinel Command Desk) with global header ribbon.
  - `frontend/styles.css`: Clean surgical styling (`#F8FAFC`, `#FFFFFF`, `#0F172A`, `#059669`, `#DC2626`), laser beam animation, and pulse effects.
  - `frontend/app.js`:
    - `EventSource` subscriber for `/api/bulletin/ingest`.
    - Interactive barcode scan buttons with laser line sweep.
    - Web Audio synthesis for register chime and lockout buzzer.
    - Live agent trace card renderer.
    - Dynamic inventory progress bar (11.4d $\to$ 3.2d $\to$ 14.0d).
    - Auto-requisition card with one-click approval button.
    - Global controls: `[ ↺ Reset Demo ]` and `[ 🔊 Sound: ON/OFF ]`.
* **Verification Command**:
  - Open `http://localhost:8000` in Google Chrome and walk through the interactive scan and bulletin trigger flows.
* **Acceptance Criteria**:
  - Scanning Box B before bulletin displays green `APPROVED`.
  - Triggering Class 1 bulletin streams live agent cards into the trace.
  - Re-scanning Box B triggers the crimson `423 DISPENSE_BLOCKED` modal and alarm buzzer.
  - Clicking `[ Approve PO ]` confirms transmission to Tamro AB.
  - Clicking `[ ↺ Reset Demo ]` clears the lockout and resets inventory instantly.

---

### Milestone 5: Hardening & Rehearsal (Fail-Safe & Demo Prep)
* **Goal**: Bulletproof the demo against live hackathon failure modes and rehearse the pitch.
* **Deliverables**:
  - `backend/data/fixture_extraction.json`: Pre-cached offline extraction payload.
  - Fallback logic in `backend/agent.py`: If LLM call times out or network drops, auto-replays pre-cached trace.
  - `README.md`: Project summary, architecture diagram, Condense integration highlights, and quickstart commands.
* **Verification Drills**:
  1. **Offline Drill**: Run demo with Wi-Fi disabled to verify fallback trace works seamlessly.
  2. **Speed Run**: Time the complete 2-minute pitch script against a stopwatch.
  3. **Side-Prize Readiness**: Confirm Condense token savings metric badge is prominent in header ribbon.
* **Acceptance Criteria**:
  - Demo runs flawlessly 3 consecutive times with zero manual interventions.
  - Pitch finishes comfortably under 2 minutes with time for judge questions.
