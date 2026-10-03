# RecallFirebreak: Human Developer & Pitcher Checklist (`CHECKLIST.md`)

This guide is designed for **you (the human builder/pitcher)** to deeply understand, validate, and test every layer of the system before, during, and after implementation.

---

## Phase 1: Conceptual Mastery (Before Writing Code)

*Ensure you can explain every concept here to a judge in 15 seconds without hesitating.*

- [ ] **1.1. Understand the Real-World Problem**
  - **Status Quo**: When a regulatory authority (e.g., Sweden's *Läkemedelsverket* or EMA) discovers toxic contamination in a drug batch, they publish a PDF bulletin. It takes **24–48 hours** for hospital supply chain admins to read it, email pharmacies, and manually update hospital ERPs. During those 48 hours, patients are actively dispensed contaminated medicine.
  - **The Fix**: RecallFirebreak turns that 48-hour human relay race into a **1.2-second autonomous circuit breaker**.

- [ ] **1.2. Master the Pharmaceutical Domain Terms**
  - **GTIN (Global Trade Item Number)**: 14-digit GS1 barcode on the package (e.g., `07350012345678`). Identifies the drug product.
  - **Lot / Batch Number**: Identifies the specific manufacturing batch (e.g., `L9824B`). *Crucial distinction*: Recalls target specific lots, not necessarily the whole GTIN. Safe lots of the same drug must remain dispensable!
  - **ATC Code (Anatomical Therapeutic Chemical)**: WHO classification hierarchy:
    - Level 5 generic: `J01CA04` (Amoxicillin).
    - Level 4 subgroup: `J01CA` (Penicillins with extended spectrum).
    - Level 4 combination: `J01CR02` (Amoxicillin + Clavulanic Acid / Spektramox). Bioequivalent alternative.

- [ ] **1.3. Understand the Agentic Decision Tree (Why an Agent?)**
  - *If a judge asks: "Why not just write a Python script with regex?"*
  - **Your Answer**: *"Regulatory bulletins are completely unstructured free-text PDFs with variable legal language, table layouts, and hazard severities. Furthermore, the agent must exercise clinical judgment: a Class 1 biological toxin requires an immediate edge kill-switch and emergency procurement, whereas a Class 3 packaging font misprint requires an audit notice without locking the register or triggering false panic shortages."*

- [ ] **1.4. Verify API Keys & Environment**
  - [ ] Python 3.10+ installed (`python3 --version`).
  - [ ] Gemini API key (`GEMINI_API_KEY`) or Google AI Studio key ready.
  - [ ] Condense API key (`CONDENSE_API_KEY`) and endpoint (`https://api.condense.chat`) tested via simple curl.

---

## Phase 2: Implementation Milestones (How to Validate Each Piece)

*Do not move to the frontend until each backend component passes these exact checks.*

### Step 1: Mock Data & State
- [ ] Check `backend/data/inventory.json`:
  - Contains Karolinska Hospital with baseline 11.4 days of Amimox (`on_hand: 5200`, `daily_burn: 400`).
- [ ] Check `backend/data/substitutes.json`:
  - Maps `J01CA04` to `J01CR02` (Spektramox via Tamro AB with 12h delivery SLA).
- [ ] Inspect both sample bulletins:
  - `bulletin_amoxicillin_class1.txt`: Contains severe particulate contamination, lot `L9824B`.
  - `bulletin_alvedon_class3.txt`: Contains harmless box label misprint, lot `P4401Z`.

### Step 2: Agent CLI Test (Before Any Web Server)
- [ ] Run the agent from terminal: `python -m backend.agent`
- [ ] **Test Case A (Class 1)**:
  - [ ] Verify Gemini calls `extract_recall`.
  - [ ] Verify Pydantic validates GTIN (14 digits) and lot without schema errors.
  - [ ] Verify agent calls `lock_items`.
  - [ ] Verify agent calls `get_inventory` and notes stock drops to 3.2 days.
  - [ ] Verify agent calls `find_substitutes` and picks Spektramox.
  - [ ] Verify agent calls `draft_purchase_order` and outputs human rationale.
- [ ] **Test Case B (Class 3)**:
  - [ ] Verify agent inspects `bulletin_alvedon_class3.txt`.
  - [ ] Verify agent **refuses** to call `lock_items` or `draft_purchase_order`.
  - [ ] Verify output states: *"Class 3 defect is non-toxic packaging misprint; no POS lockout engaged."*

### Step 3: FastAPI Endpoint Sanity Checks
- [ ] Launch backend: `uvicorn backend.main:app --port 8000`
- [ ] **Test Scan Endpoint** via curl or browser:
  ```bash
  curl -X POST "http://localhost:8000/api/pos/scan?gtin=07350012345678&lot=L9824B"
  ```
  - Before bulletin: Returns `{"status": "APPROVED", "code": 200}`.
- [ ] **Test Ingestion Endpoint**:
  ```bash
  curl -N -X POST "http://localhost:8000/api/bulletin/ingest?type=class1"
  ```
  - Verify SSE stream outputs JSON events (`tool_call`, `lockout`, `inventory`, `po_draft`, `done`).
- [ ] **Test Post-Lockout Scan**:
  ```bash
  curl -X POST "http://localhost:8000/api/pos/scan?gtin=07350012345678&lot=L9824B"
  ```
  - Returns `{"status": "DISPENSE_BLOCKED", "code": 423}`.
- [ ] **Test Safe Batch Scan**:
  ```bash
  curl -X POST "http://localhost:8000/api/pos/scan?gtin=07350012345678&lot=L1100A"
  ```
  - Returns `{"status": "APPROVED", "code": 200}` (proves selective lot targeting).
- [ ] **Test Reset**:
  ```bash
  curl -X POST "http://localhost:8000/api/reset"
  ```
  - Scans return back to 200 `APPROVED`.

---

## Phase 3: End-to-End System Testing (Full UI + Audio)

*Open `http://localhost:8000` in Google Chrome and verify each interactive element.*

- [ ] **3.1. Frontline Register (Left Panel)**
  - [ ] Click **Box A** (Safe Amimox):
    - [ ] Red laser scan animation plays across the barcode.
    - [ ] Cash register scan chime plays.
    - [ ] Receipt ledger appends row: `Amimox 500mg (L1100A) - 145.00 SEK - APPROVED`.
  - [ ] Click **Box B** (Target Lot before recall):
    - [ ] Scans green `APPROVED`.
  - [ ] Click **Box C** (Alvedon Control):
    - [ ] Scans green `APPROVED`.

- [ ] **3.2. Autonomous Agent Intelligence (Right Panel)**
  - [ ] Click **`[ ℹ Load Class 3: Alvedon Misprint ]`**:
    - [ ] Agent trace animates step-by-step in clean clinical cards.
    - [ ] Trace concludes with: *"Severity: Class 3. No edge lockout required."*
    - [ ] Re-click Box C on POS: Still scans green `APPROVED`.
  - [ ] Click **`[ ⚠ Load Class 1: Amimox Contamination ]`**:
    - [ ] Agent trace streams in real time.
    - [ ] Telemetry chips update: Condense token compaction (-77%), latency (~1.1s).
    - [ ] Hospital Inventory Bar visibly drops from `11.4 days` to `3.2 days` and turns amber.
    - [ ] Auto-Requisition Card populates with Spektramox order for 5,000 units.

- [ ] **3.3. The Physical Lockout Climax**
  - [ ] Click **Box B** (Recalled Lot):
    - [ ] Screen border flashes crimson (`#DC2626`).
    - [ ] Full modal opens: `423 DISPENSE_BLOCKED: CRITICAL RECALL`.
    - [ ] Web Audio dual-tone alarm buzzer sounds.
  - [ ] Click **Box A** (Safe Lot of same drug):
    - [ ] Still scans green `APPROVED` (Judges will specifically look for this!).

- [ ] **3.4. Human-in-the-Loop Procurement Approval**
  - [ ] Click **`[ Approve & Transmit Purchase Order ]`**:
    - [ ] Button smoothly transitions to green checkmark badge: `✓ PO-2026-0912 Transmitted via EDI to Tamro AB`.
    - [ ] Inventory bar restores to `14.0 days (Protected)`.

- [ ] **3.5. Instant Demo Reset**
  - [ ] Click **`[ ↺ Reset Demo ]`**:
    - [ ] Everything clears back to baseline in under 200ms.
    - [ ] Re-scan Box B: Scans green `APPROVED` again. (Ready for the next judge!).

---

## Phase 4: Fail-Safe & Edge Case Preparedness

*Hackathons have unpredictable venue Wi-Fi and unexpected hiccups. Practice these drills.*

- [ ] **Offline / Timeout Fallback Drill**:
  - [ ] Disconnect Wi-Fi or set invalid API key.
  - [ ] Click `[ Load Class 1 ]`.
  - [ ] Verify system catches network error and seamlessly plays `fixture_extraction.json` pre-recorded trace so the demo on stage never crashes.
- [ ] **Audio Autoplay Safety Drill**:
  - [ ] Verify that clicking the UI unmutes Web Audio cleanly.
  - [ ] Test the `[ 🔊 Sound: ON/OFF ]` toggle button to ensure silent presentation mode works if needed.
- [ ] **Projector Contrast Check**:
  - [ ] Zoom browser to 125% and view from 3 meters away.
  - [ ] Ensure all text, badges, and red lockout modals are legible in bright light.

---

## Phase 5: The 2-Minute Pitch & Judging Script

*Practice this with a stopwatch until it feels effortless.*

- [ ] **0:00–0:25 (The Hook & Stakes)**:
  - *"Today, when a pharmaceutical regulator recalls a contaminated medicine, it takes 48 hours for PDFs and emails to crawl into hospital dispensing registers. During those 48 hours, patients are poisoned. RecallFirebreak turns that 48 hours into 1.2 seconds."*
- [ ] **0:25–0:50 (The Register & Differential Intelligence)**:
  - *Scan Box B $\to$ show normal green dispensing.*
  - *Click Class 3 $\to$ show agent reasoning that packaging misprints should not panic-lock hospital registers.*
- [ ] **0:50–1:20 (The Critical Lockout)**:
  - *Click Class 1 $\to$ watch live agent tool-calling trace.*
  - *Point to Condense telemetry: 'Condense compacted legal boilerplate by 77%, keeping pipeline under 1.2s.'*
  - *Rescan Box B $\to$ trigger full crimson `423 DISPENSE_BLOCKED` + buzzer.*
- [ ] **1:20–1:45 (The Cascade & Human-in-the-Loop)**:
  - *Show Karolinska Hospital inventory collapsing to 3.2 days.*
  - *Show the auto-drafted bioequivalent PO (Spektramox via Tamro).*
  - *Click 'Approve & Transmit PO'. Explain why human-in-the-loop is mandatory in safety-critical AI.*
- [ ] **1:45–2:00 (The Reset & Vision)**:
  - *Click `[ ↺ Reset Demo ]`.*
  - *"The same autonomous circuit breaker protects aircraft parts, baby formula, and critical infrastructure supply chains."*
