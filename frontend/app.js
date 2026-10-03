/* ==========================================================================
   RecallFirebreak — Frontend Controller & Real-Time SSE Listener
   ========================================================================== */

// --- Global Audio Synthesis (Web Audio API) ---
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playScanChime() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now); // A5
  osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1760, now + 0.04);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);

  osc1.start(now);
  osc2.start(now + 0.04);
  osc1.stop(now + 0.16);
  osc2.stop(now + 0.16);
}

function playBuzzer() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  // Two-tone jarring alarm
  for (let i = 0; i < 2; i++) {
    const start = now + (i * 0.14);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, start);
    osc.frequency.linearRampToValueAtTime(120, start + 0.12);

    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(start);
    osc.stop(start + 0.12);
  }
}

// --- DOM Elements ---
const btnSound = document.getElementById('btn-sound');
const soundIcon = document.getElementById('sound-icon');
const soundText = document.getElementById('sound-text');
const btnReset = document.getElementById('btn-reset');

const panelPos = document.getElementById('panel-pos');
const ledgerTbody = document.getElementById('ledger-tbody');
const ledgerCount = document.getElementById('ledger-count');

const btnTriggerClass1 = document.getElementById('btn-trigger-class1');
const btnTriggerClass3 = document.getElementById('btn-trigger-class3');

const daysVal = document.getElementById('days-val');
const progressFill = document.getElementById('progress-fill');
const stockUnitsLabel = document.getElementById('stock-units-label');
const stockStatusBadge = document.getElementById('stock-status-badge');

const poCard = document.getElementById('po-card');
const poIdTag = document.getElementById('po-id-tag');
const poSubName = document.getElementById('po-sub-name');
const poSubDesc = document.getElementById('po-sub-desc');
const poSupplier = document.getElementById('po-supplier');
const poUnits = document.getElementById('po-units');
const poCost = document.getElementById('po-cost');
const poRationale = document.getElementById('po-rationale');
const btnApprovePo = document.getElementById('btn-approve-po');

const traceStream = document.getElementById('trace-stream');
const traceStatusText = document.getElementById('trace-status-text');
const telemetryPipeline = document.getElementById('telemetry-pipeline');
const telemetryLockout = document.getElementById('telemetry-lockout');

const lockoutModal = document.getElementById('lockout-modal');
const modalProduct = document.getElementById('modal-product');
const modalGtin = document.getElementById('modal-gtin');
const modalLot = document.getElementById('modal-lot');
const modalReason = document.getElementById('modal-reason');
const btnCloseModal = document.getElementById('btn-close-modal');

let scannedItemsCount = 0;
let currentPoId = null;
let activeEventSource = null;

// --- Sound Toggle ---
btnSound.addEventListener('click', () => {
  initAudio();
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundIcon.textContent = '🔊';
    soundText.textContent = 'Sound: ON';
    btnSound.classList.remove('muted');
  } else {
    soundIcon.textContent = '🔇';
    soundText.textContent = 'Sound: OFF';
    btnSound.classList.add('muted');
  }
});

// --- Medication Scanning Flow ---
function setupCard(cardId, btnId, laserId) {
  const card = document.getElementById(cardId);
  const btn = document.getElementById(btnId);
  const laser = document.getElementById(laserId);
  const gtin = card.dataset.gtin;
  const lot = card.dataset.lot;

  const triggerScan = async () => {
    initAudio();

    // Laser beam animation
    laser.classList.remove('scanning');
    void laser.offsetWidth; // trigger reflow
    laser.classList.add('scanning');

    try {
      const resp = await fetch(`/api/pos/scan?gtin=${encodeURIComponent(gtin)}&lot=${encodeURIComponent(lot)}`, {
        method: 'POST'
      });
      const data = await resp.json();

      if (resp.status === 200) {
        // APPROVED
        playScanChime();
        card.classList.remove('scanned-red');
        card.classList.add('scanned-green');
        setTimeout(() => card.classList.remove('scanned-green'), 600);
        appendLedger(data, true);
      } else if (resp.status === 423) {
        // DISPENSE BLOCKED (KILL-SWITCH CLIMAX)
        playBuzzer();
        card.classList.remove('scanned-green');
        card.classList.add('scanned-red');
        panelPos.classList.add('lockout-active');
        appendLedger(data, false);
        openLockoutModal(data);
      } else {
        appendLedger(data, false);
      }
    } catch (err) {
      console.error('Scan request error:', err);
    }
  };

  card.addEventListener('click', triggerScan);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerScan();
  });
}

setupCard('card-box-a', 'btn-scan-a', 'laser-a');
setupCard('card-box-b', 'btn-scan-b', 'laser-b');
setupCard('card-box-c', 'btn-scan-c', 'laser-c');

function appendLedger(item, isApproved) {
  scannedItemsCount++;
  ledgerCount.textContent = `${scannedItemsCount} item${scannedItemsCount === 1 ? '' : 's'} scanned`;

  const emptyRow = ledgerTbody.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);

  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><strong>${escapeHtml(item.brand_name)}</strong></td>
    <td><span class="mono">${escapeHtml(item.lot)}</span></td>
    <td>${item.price_sek ? item.price_sek.toFixed(2) + ' SEK' : '—'}</td>
    <td>
      <span class="${isApproved ? 'status-badge-approved' : 'status-badge-blocked'}">
        ${isApproved ? 'APPROVED' : '423 LOCKED'}
      </span>
    </td>
  `;
  ledgerTbody.prepend(tr);
}

function openLockoutModal(data) {
  modalProduct.textContent = `${data.brand_name}`;
  modalGtin.textContent = data.gtin;
  modalLot.textContent = data.lot;
  modalReason.textContent = data.message || 'Microscopic particulate contamination. Severe acute toxic mucosal hazard.';
  lockoutModal.classList.remove('hidden');
}

btnCloseModal.addEventListener('click', () => {
  lockoutModal.classList.add('hidden');
});

// --- Regulatory Ingestion & SSE Stream ---
function triggerBulletin(type) {
  initAudio();

  if (activeEventSource) {
    activeEventSource.close();
  }

  // UI state updates
  btnTriggerClass1.disabled = true;
  btnTriggerClass3.disabled = true;
  traceStatusText.textContent = `Processing ${type.toUpperCase()}...`;
  telemetryPipeline.textContent = 'Streaming...';

  // Clear trace stream
  traceStream.innerHTML = '';

  const eventSource = new EventSource(`/api/bulletin/ingest?type=${type}`);
  activeEventSource = eventSource;

  eventSource.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      handleAgentEvent(ev);
    } catch (err) {
      console.error('Failed to parse SSE frame:', err, e.data);
    }
  };

  eventSource.onerror = (err) => {
    console.warn('SSE stream ended or error:', err);
    eventSource.close();
    activeEventSource = null;
    btnTriggerClass1.disabled = false;
    btnTriggerClass3.disabled = false;
    traceStatusText.textContent = 'Completed';
  };
}

btnTriggerClass1.addEventListener('click', () => triggerBulletin('class1'));
btnTriggerClass3.addEventListener('click', () => triggerBulletin('class3'));

function handleAgentEvent(ev) {
  const tStr = ev.t_ms !== undefined ? `${ev.t_ms}ms` : '';

  if (ev.type === 'started') {
    appendTraceCard('INTAKE_STARTED', `Bulletin type: ${ev.bulletin}`, tStr);
  } else if (ev.type === 'tool_call') {
    appendTraceCard(`CALL: ${ev.tool}`, formatArgs(ev.args), tStr);
  } else if (ev.type === 'tool_result') {
    // Tool completed
  } else if (ev.type === 'lockout') {
    telemetryLockout.textContent = tStr || '32ms';
    panelPos.classList.add('lockout-active');
    appendTraceCard(
      '🚨 KILL-SWITCH DISPATCHED',
      `Locked GTIN: ${ev.gtin} | Lots: ${ev.lots.join(', ')}\n${ev.message}`,
      tStr,
      'card-lockout'
    );
  } else if (ev.type === 'inventory') {
    updateInventoryDisplay(ev);
    appendTraceCard(
      'INVENTORY_BURNDOWN',
      `Stock dropped: ${ev.days_before}d → ${ev.days_remaining}d (${ev.quarantined_units} units quarantined). Deficit: ${ev.units_needed_for_14_day_buffer} units.`,
      tStr
    );
  } else if (ev.type === 'po_draft') {
    renderPurchaseOrder(ev.po);
    appendTraceCard(
      'PO_STAGED_FOR_APPROVAL',
      `PO-ID: ${ev.po.po_id} | Substitute: ${ev.po.recommended_substitute.brand_name} (${ev.po.requested_units} units, ${ev.po.estimated_cost_sek} SEK)`,
      tStr
    );
  } else if (ev.type === 'audit_note') {
    appendTraceCard(
      'ℹ️ AUDIT_LOG_ENTRY (CLASS 3)',
      `${ev.note}\nFollow-up: ${ev.follow_up}`,
      tStr
    );
  } else if (ev.type === 'agent_summary') {
    appendTraceCard('CLINICAL_AUDIT_SUMMARY', ev.text, tStr, 'card-summary');
  } else if (ev.type === 'done') {
    telemetryPipeline.textContent = `${ev.elapsed_ms}ms`;
    traceStatusText.textContent = `Finished in ${ev.elapsed_ms}ms (${ev.model})`;
    btnTriggerClass1.disabled = false;
    btnTriggerClass3.disabled = false;
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
  } else if (ev.type === 'error') {
    appendTraceCard('ERROR', ev.message, tStr, 'card-lockout');
  }
}

function appendTraceCard(title, body, timeStr, customClass = '') {
  const card = document.createElement('div');
  card.className = `trace-card ${customClass}`;
  card.innerHTML = `
    <div class="trace-card-header">
      <span class="trace-tool-title">${escapeHtml(title)}</span>
      <span class="trace-time">${escapeHtml(timeStr)}</span>
    </div>
    <div class="trace-body">${escapeHtml(body)}</div>
  `;
  traceStream.appendChild(card);
  traceStream.scrollTop = traceStream.scrollHeight;
}

function formatArgs(args) {
  if (!args) return '';
  try {
    return JSON.stringify(args, null, 2);
  } catch (e) {
    return String(args);
  }
}

function updateInventoryDisplay(inv) {
  const days = inv.days_remaining;
  daysVal.textContent = days.toFixed(1);

  // 14 days max baseline for progress width
  const pct = Math.min(100, Math.max(0, (days / 14.0) * 100));
  progressFill.style.width = `${pct}%`;

  if (days <= 4.0) {
    daysVal.classList.add('warning');
    progressFill.classList.remove('fill-nominal');
    progressFill.classList.add('fill-critical');
    stockStatusBadge.className = 'badge badge-stock-status critical';
    stockStatusBadge.textContent = 'CRITICAL DEFICIT (< 4 DAYS)';
  } else {
    daysVal.classList.remove('warning');
    progressFill.classList.remove('fill-critical');
    progressFill.classList.add('fill-nominal');
    stockStatusBadge.className = 'badge badge-stock-status';
    stockStatusBadge.textContent = 'RESERVE NOMINAL';
  }

  stockUnitsLabel.textContent = `${inv.usable_units.toLocaleString()} usable units of ${inv.total_units.toLocaleString()} total stock`;
}

function renderPurchaseOrder(po) {
  currentPoId = po.po_id;
  poIdTag.textContent = po.po_id;
  poSubName.textContent = po.recommended_substitute.brand_name;
  poSubDesc.textContent = `WHO ATC: ${po.recommended_substitute.atc_code} · ${po.recommended_substitute.substance}`;
  poSupplier.textContent = po.recommended_substitute.supplier_name;
  poUnits.textContent = `${po.requested_units.toLocaleString()} units`;
  poCost.textContent = `${po.estimated_cost_sek.toLocaleString()} SEK`;
  poRationale.textContent = po.audit_rationale;

  btnApprovePo.disabled = false;
  btnApprovePo.className = 'btn btn-approve-po';
  btnApprovePo.textContent = '✓ Approve & Transmit Purchase Order';

  poCard.classList.remove('hidden');
}

// --- PO Approval Handler ---
btnApprovePo.addEventListener('click', async () => {
  if (!currentPoId || btnApprovePo.disabled) return;
  initAudio();

  try {
    const resp = await fetch(`/api/po/approve?po_id=${encodeURIComponent(currentPoId)}`, {
      method: 'POST'
    });
    if (resp.ok) {
      playScanChime();
      btnApprovePo.disabled = true;
      btnApprovePo.className = 'btn btn-approve-po approved';
      btnApprovePo.textContent = '✓ Dispatched to Tamro AB Sweden via EDI';

      // Restore inventory display to 14.0 days
      daysVal.textContent = '14.0';
      daysVal.classList.remove('warning');
      progressFill.style.width = '100%';
      progressFill.classList.remove('fill-critical');
      progressFill.classList.add('fill-nominal');
      stockStatusBadge.className = 'badge badge-stock-status';
      stockStatusBadge.textContent = 'PROTECTED (14.0 DAYS)';

      appendTraceCard(
        '✓ HUMAN_APPROVAL_TRANSMITTED',
        `Purchase Order ${currentPoId} approved and dispatched to Tamro AB Sweden. Supply chain deficit resolved.`,
        'Confirmed'
      );
    }
  } catch (err) {
    console.error('Failed to approve PO:', err);
  }
});

// --- Reset Demo Handler ---
btnReset.addEventListener('click', async () => {
  initAudio();
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  try {
    const resp = await fetch('/api/reset', { method: 'POST' });
    if (resp.ok) {
      // Clear visual lockouts
      panelPos.classList.remove('lockout-active');
      lockoutModal.classList.add('hidden');

      // Reset inventory bar to 11.4 days
      daysVal.textContent = '11.4';
      daysVal.classList.remove('warning');
      progressFill.style.width = '81%';
      progressFill.classList.remove('fill-critical');
      progressFill.classList.add('fill-nominal');
      stockStatusBadge.className = 'badge badge-stock-status';
      stockStatusBadge.textContent = 'RESERVE NOMINAL';
      stockUnitsLabel.textContent = '4,560 usable units of 4,560 total stock';

      // Hide PO card
      poCard.classList.add('hidden');
      currentPoId = null;

      // Reset buttons and trace
      btnTriggerClass1.disabled = false;
      btnTriggerClass3.disabled = false;
      traceStatusText.textContent = 'Standby';
      telemetryPipeline.textContent = 'Idle';
      telemetryLockout.textContent = '32ms';

      traceStream.innerHTML = `
        <div class="trace-empty">
          <span class="trace-empty-icon">⚡</span>
          <p>Click a regulatory bulletin above to observe Gemini's tool-calling sequence in real time.</p>
        </div>
      `;

      // Visual brief feedback on reset button
      btnReset.textContent = '✓ Cleared';
      setTimeout(() => btnReset.innerHTML = '<span>↺ Reset Demo</span>', 800);
    }
  } catch (err) {
    console.error('Reset failed:', err);
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
