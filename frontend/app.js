/* ==========================================================================
   RecallFirebreak — Incident Lifecycle Frontend Controller (4-Step Pipeline)
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
  osc1.frequency.setValueAtTime(880, now);
  osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

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

// --- Lifecycle Stepper Navigation ---
let currentStep = 1;
const stepButtons = document.querySelectorAll('.step-btn');
const stepViews = document.querySelectorAll('.step-view');

function goToStep(stepNum) {
  currentStep = parseInt(stepNum, 10);

  stepButtons.forEach(btn => {
    const num = parseInt(btn.dataset.step, 10);
    btn.classList.toggle('active', num === currentStep);
  });

  stepViews.forEach(view => {
    view.classList.toggle('active', view.id === `view-step-${currentStep}`);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

stepButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    initAudio();
    goToStep(btn.dataset.step);
  });
});

// Inter-step link buttons
document.getElementById('btn-view-action-1').addEventListener('click', () => goToStep(2));
document.getElementById('btn-to-depletion').addEventListener('click', () => goToStep(3));
document.getElementById('btn-back-to-1').addEventListener('click', () => goToStep(1));
document.getElementById('btn-to-sourcing').addEventListener('click', () => goToStep(4));
document.getElementById('btn-back-to-2').addEventListener('click', () => goToStep(2));
document.getElementById('btn-back-to-3').addEventListener('click', () => goToStep(3));
document.getElementById('btn-back-to-start').addEventListener('click', () => goToStep(1));

// --- Settings & Integrations Slide-Over Drawer ---
const settingsBackdrop = document.getElementById('settings-backdrop');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

btnOpenSettings.addEventListener('click', () => {
  initAudio();
  settingsBackdrop.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  settingsBackdrop.classList.add('hidden');
});

settingsBackdrop.addEventListener('click', (e) => {
  if (e.target === settingsBackdrop) {
    settingsBackdrop.classList.add('hidden');
  }
});

// --- Monitored Regulatory Sources Modal Drawer ---
const btnShowSources = document.getElementById('btn-show-sources');
const sourcesModalBackdrop = document.getElementById('sources-modal-backdrop');
const btnCloseSources = document.getElementById('btn-close-sources');

if (btnShowSources && sourcesModalBackdrop) {
  btnShowSources.addEventListener('click', () => {
    initAudio();
    sourcesModalBackdrop.classList.remove('hidden');
  });
}

if (btnCloseSources && sourcesModalBackdrop) {
  btnCloseSources.addEventListener('click', () => {
    sourcesModalBackdrop.classList.add('hidden');
  });
}

if (sourcesModalBackdrop) {
  sourcesModalBackdrop.addEventListener('click', (e) => {
    if (e.target === sourcesModalBackdrop) {
      sourcesModalBackdrop.classList.add('hidden');
    }
  });
}

// Global ESC key to close any active modal drawer
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (sourcesModalBackdrop) sourcesModalBackdrop.classList.add('hidden');
    if (settingsBackdrop) settingsBackdrop.classList.add('hidden');
  }
});

// Ping source triggers in modal
document.querySelectorAll('.btn-ping-source').forEach(btn => {
  btn.addEventListener('click', () => {
    initAudio();
    playScanChime();
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>⚡ Polling...</span>';
    btn.disabled = true;

    setTimeout(() => {
      btn.innerHTML = '<span>✓ Polled (200 OK)</span>';
      const pollTimer = document.getElementById('sources-poll-timer');
      if (pollTimer) pollTimer.textContent = 'Polled just now';
      const time1 = document.getElementById('time-src-1');
      if (time1) time1.textContent = 'Just now';

      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }, 1200);
    }, 450);
  });
});

// Add custom source target form
const btnSaveNewSource = document.getElementById('btn-save-new-source');
const newSourceName = document.getElementById('new-source-name');
const newSourceUrl = document.getElementById('new-source-url');
const sourcesModalList = document.querySelector('.sources-modal-list');
const sourcesCheckedFeed = document.getElementById('sources-checked-feed');

if (btnSaveNewSource && newSourceName && newSourceUrl) {
  btnSaveNewSource.addEventListener('click', () => {
    const name = newSourceName.value.trim();
    const url = newSourceUrl.value.trim();
    if (!name || !url) {
      alert('Please provide authority name and URL.');
      return;
    }
    initAudio();
    playScanChime();

    // Append to modal
    const item = document.createElement('div');
    item.className = 'source-modal-item';
    item.innerHTML = `
      <div class="smi-header">
        <div class="smi-title-wrap">
          <span class="smi-flag">🌐</span>
          <strong class="smi-name">${escapeHtml(name)}</strong>
        </div>
        <span class="badge badge-success">● ACTIVE (200 OK)</span>
      </div>
      <div class="smi-meta">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="smi-url mono">${escapeHtml(url)} ↗</a>
        <div class="smi-tags">
          <span class="smi-tag">Type: Custom Poller</span>
          <span class="smi-tag">Interval: 60s</span>
          <span class="smi-tag">Last Polled: Just added</span>
        </div>
      </div>
      <button class="btn btn-xs btn-outline btn-ping-source" data-src="${escapeHtml(name)}">⚡ Scrape Now (Ping)</button>
    `;
    sourcesModalList.appendChild(item);

    // Rebind ping button on new element
    item.querySelector('.btn-ping-source').addEventListener('click', function() {
      initAudio();
      playScanChime();
      this.innerHTML = '<span>⚡ Polling...</span>';
      setTimeout(() => {
        this.innerHTML = '<span>✓ Polled (200 OK)</span>';
        setTimeout(() => { this.innerHTML = '⚡ Scrape Now (Ping)'; }, 1000);
      }, 400);
    });

    // Append to checked feed
    if (sourcesCheckedFeed) {
      const feedRow = document.createElement('div');
      feedRow.className = 'source-feed-row';
      feedRow.innerHTML = `
        <span class="badge badge-success mono-xs">200 OK</span>
        <div class="source-feed-info">
          <span class="source-feed-name">${escapeHtml(name)}</span>
        </div>
        <span class="source-feed-time mono-xs">Just now</span>
        <span class="source-feed-delta zero mono-xs">0 new</span>
      `;
      sourcesCheckedFeed.prepend(feedRow);
    }

    newSourceName.value = '';
    newSourceUrl.value = '';
    btnSaveNewSource.textContent = '✓ Added!';
    setTimeout(() => { btnSaveNewSource.textContent = '+ Add Scraper Target'; }, 1000);
  });
}

// --- Sound Toggle ---
const btnSound = document.getElementById('btn-sound');
const soundIcon = document.getElementById('sound-icon');
const soundLabel = document.getElementById('sound-label');

btnSound.addEventListener('click', () => {
  initAudio();
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundIcon.textContent = '🔊';
    soundLabel.textContent = 'Sound';
    btnSound.classList.remove('muted');
  } else {
    soundIcon.textContent = '🔇';
    soundLabel.textContent = 'Muted';
    btnSound.classList.add('muted');
  }
});

// --- Step 1: Bulletin Ingestion & Real-Time SSE Stream ---
const btnSimClass1 = document.getElementById('btn-sim-class1');
const btnSimClass3 = document.getElementById('btn-sim-class3');
const traceConsoleStream = document.getElementById('trace-console-stream');
const step1TraceStatus = document.getElementById('step1-trace-status');
const telStatus = document.getElementById('tel-status');
const telLatency = document.getElementById('tel-latency');
const feedAmimoxStatus = document.getElementById('feed-amimox-status');

// Stepper status indicators
const stepStatus1 = document.getElementById('step-status-1');
const stepStatus2 = document.getElementById('step-status-2');
const stepStatus3 = document.getElementById('step-status-3');
const stepStatus4 = document.getElementById('step-status-4');
const stepTab2 = document.getElementById('step-tab-2');
const stepTab3 = document.getElementById('step-tab-3');
const stepTab4 = document.getElementById('step-tab-4');

// Collapsible Decision Stream Elements
const traceCardContainer = document.getElementById('trace-card-container');
const traceToggleHeader = document.getElementById('trace-toggle-header');
const btnToggleTrace = document.getElementById('btn-toggle-trace');
const traceToggleIcon = document.getElementById('trace-toggle-icon');
const traceToggleText = document.getElementById('trace-toggle-text');

function toggleTraceCollapse(forceState) {
  if (!traceCardContainer) return;
  const shouldCollapse = forceState !== undefined ? forceState : !traceCardContainer.classList.contains('collapsed');
  traceCardContainer.classList.toggle('collapsed', shouldCollapse);
  if (btnToggleTrace) {
    btnToggleTrace.setAttribute('aria-expanded', !shouldCollapse);
  }
  if (traceToggleIcon) {
    traceToggleIcon.textContent = shouldCollapse ? '▼' : '▲';
  }
  if (traceToggleText) {
    traceToggleText.textContent = shouldCollapse ? 'Expand Stream' : 'Collapse Stream';
  }
}

if (traceToggleHeader) {
  traceToggleHeader.addEventListener('click', (e) => {
    if (e.target.closest('#btn-toggle-trace')) return;
    toggleTraceCollapse();
  });
}

if (btnToggleTrace) {
  btnToggleTrace.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTraceCollapse();
  });
}

// Expandable Finding Cards Setup
function setupExpandableFindingCards() {
  const cards = document.querySelectorAll('.finding-card');
  cards.forEach(card => {
    const summary = card.querySelector('.finding-card-summary');
    const cueLabel = card.querySelector('.cue-label');
    if (!summary) return;

    summary.addEventListener('click', () => {
      initAudio();
      const isExpanded = card.classList.toggle('expanded');
      if (cueLabel) {
        cueLabel.textContent = isExpanded ? 'Hide Details & Collapse' : 'Batch Details & Quarantine Action';
      }
    });

    summary.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        summary.click();
      }
    });
  });

  // Action buttons inside expanded cards that link to Step 2
  document.querySelectorAll('.btn-goto-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      goToStep(2);
    });
  });
}

setupExpandableFindingCards();

// Dropzone & File Picker Elements
const dropzoneBox = document.getElementById('dropzone-box');
const bulletinFileInput = document.getElementById('bulletin-file-input');
const dropzoneDefaultView = document.getElementById('dropzone-default-view');
const dropzonePreviewView = document.getElementById('dropzone-preview-view');
const dfpFilename = document.getElementById('dfp-filename');
const dfpSize = document.getElementById('dfp-size');
const btnClearFile = document.getElementById('btn-clear-file');
const btnRunDropped = document.getElementById('btn-run-dropped');

let stagedFileText = null;
let stagedFileName = '';

function setupDropzoneAndIngestion() {
  if (!dropzoneBox || !bulletinFileInput) return;

  // Click on dropzone triggers file picker
  dropzoneBox.addEventListener('click', (e) => {
    if (e.target.closest('#btn-clear-file') || e.target.closest('#btn-run-dropped')) return;
    initAudio();
    bulletinFileInput.click();
  });

  // File input change
  bulletinFileInput.addEventListener('change', () => {
    if (bulletinFileInput.files && bulletinFileInput.files.length > 0) {
      handleFileSelected(bulletinFileInput.files[0]);
    }
  });

  // Drag & drop listeners
  ['dragenter', 'dragover'].forEach(evtName => {
    dropzoneBox.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneBox.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(evtName => {
    dropzoneBox.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneBox.classList.remove('dragover');
    });
  });

  dropzoneBox.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneBox.classList.remove('dragover');
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFileSelected(dt.files[0]);
    }
  });

  if (btnClearFile) {
    btnClearFile.addEventListener('click', (e) => {
      e.stopPropagation();
      clearStagedFile();
    });
  }

  if (btnRunDropped) {
    btnRunDropped.addEventListener('click', (e) => {
      e.stopPropagation();
      if (stagedFileText) {
        ingestCustomBulletinStream(stagedFileText, stagedFileName);
      }
    });
  }
}

function handleFileSelected(file) {
  initAudio();
  playScanChime();
  const reader = new FileReader();
  reader.onload = (e) => {
    stagedFileText = e.target.result;
    stagedFileName = file.name;

    if (dfpFilename) dfpFilename.textContent = file.name;
    if (dfpSize) dfpSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
    if (dropzoneDefaultView) dropzoneDefaultView.classList.add('hidden');
    if (dropzonePreviewView) dropzonePreviewView.classList.remove('hidden');

    // Automatically trigger Gemini agent parser stream
    ingestCustomBulletinStream(stagedFileText, stagedFileName);
  };
  reader.readAsText(file);
}

function clearStagedFile() {
  stagedFileText = null;
  stagedFileName = '';
  if (bulletinFileInput) bulletinFileInput.value = '';
  if (dropzonePreviewView) dropzonePreviewView.classList.add('hidden');
  if (dropzoneDefaultView) dropzoneDefaultView.classList.remove('hidden');
}

setupDropzoneAndIngestion();

// Custom Bulletin File Ingestion via POST /api/bulletin/ingest SSE Stream
async function ingestCustomBulletinStream(rawText, filename = 'uploaded_bulletin') {
  initAudio();
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  btnSimClass1.disabled = true;
  btnSimClass3.disabled = true;
  if (btnRunDropped) btnRunDropped.disabled = true;

  telStatus.textContent = 'Parsing File...';
  step1TraceStatus.textContent = `Processing ${filename}...`;
  traceConsoleStream.innerHTML = '';
  toggleTraceCollapse(false); // auto-expand stream

  const t0 = performance.now();
  try {
    const resp = await fetch('/api/bulletin/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Server returned ${resp.status}: ${errText}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop(); // keep residual partial chunk
      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.substring(6));
              handleAgentStepEvent(ev, filename);
            } catch (err) {
              console.warn('Failed to parse SSE JSON line:', line, err);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('File ingest error:', err);
    appendTraceRow('ERROR', err.message, `${Math.round(performance.now() - t0)}ms`, 't-lockout');
  } finally {
    btnSimClass1.disabled = false;
    btnSimClass3.disabled = false;
    if (btnRunDropped) btnRunDropped.disabled = false;
  }
}

let activeEventSource = null;

function triggerSimulation(type) {
  initAudio();

  if (activeEventSource) {
    activeEventSource.close();
  }

  // Ensure trace stream is open so user sees tool calls
  toggleTraceCollapse(false);

  btnSimClass1.disabled = true;
  btnSimClass3.disabled = true;
  telStatus.textContent = 'Streaming SSE...';
  step1TraceStatus.textContent = `Processing ${type.toUpperCase()}...`;
  traceConsoleStream.innerHTML = '';

  const eventSource = new EventSource(`/api/bulletin/ingest?type=${type}`);
  activeEventSource = eventSource;

  eventSource.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      handleAgentStepEvent(ev, type);
    } catch (err) {
      console.error('Failed to parse SSE frame:', err, e.data);
    }
  };

  eventSource.onerror = (err) => {
    console.warn('SSE stream closed or error:', err);
    eventSource.close();
    activeEventSource = null;
    btnSimClass1.disabled = false;
    btnSimClass3.disabled = false;
    step1TraceStatus.textContent = 'Finished';
  };
}

btnSimClass1.addEventListener('click', () => triggerSimulation('class1'));
btnSimClass3.addEventListener('click', () => triggerSimulation('class3'));

function handleAgentStepEvent(ev, bulletinType) {
  const tStr = ev.t_ms !== undefined ? `${ev.t_ms}ms` : '';

  if (ev.type === 'started') {
    appendTraceRow('INTAKE_PARSER_STARTED', `Ingesting ${bulletinType.toUpperCase()} bulletin...`, tStr);
  } else if (ev.type === 'tool_call') {
    appendTraceRow(`TOOL CALL: ${ev.tool}`, formatPayload(ev.args), tStr);
  } else if (ev.type === 'tool_result') {
    // result received
  } else if (ev.type === 'lockout') {
    // STEP 2 STATE ACTIVATION
    stepTab2.classList.add('has-alert');
    stepStatus2.textContent = '100% BLOCKED';
    telLatency.textContent = tStr || '32ms';

    setBranchTopologyLocked(true, ev.gtin, ev.lots);
    appendAuditLedgerRow({
      target: 'All Regional Endpoints (14 Nodes)',
      drug: `GTIN ${ev.gtin}`,
      lot: (ev.lots || []).join(', '),
      outcomeHtml: `<span class="badge badge-danger">CENTRAL KILL-SWITCH</span> <span class="mono-xs bold text-crimson">Gemini Autonomous Quarantine Enforced via WebSocket Mesh</span>`,
      latency: tStr || '32ms'
    });
    appendTraceRow('🚨 PHYSICAL KILL-SWITCH DISPATCHED', `Locked GTIN ${ev.gtin} lots [${ev.lots.join(', ')}] across all registers`, tStr, 't-lockout');
  } else if (ev.type === 'inventory') {
    // STEP 3 STATE ACTIVATION
    stepTab3.classList.add('has-alert');
    stepStatus3.textContent = `${ev.days_remaining}d (Breached)`;
    updateDepletionView(ev);
    appendTraceRow('INVENTORY_BURNDOWN', `Reserve collapsed: ${ev.days_before}d → ${ev.days_remaining}d (${ev.quarantined_units} units quarantined). Deficit: ${ev.units_needed_for_14_day_buffer} units`, tStr);
  } else if (ev.type === 'po_draft') {
    // STEP 4 STATE ACTIVATION
    stepTab4.classList.add('has-alert');
    stepStatus4.textContent = 'PO Staged';
    updateProcurementView(ev.po);
    appendTraceRow('PO_STAGED_FOR_APPROVAL', `Staged PO ${ev.po.po_id} for ${ev.po.requested_units} units ${ev.po.recommended_substitute.brand_name} (${ev.po.estimated_cost_sek} SEK)`, tStr);
  } else if (ev.type === 'audit_note') {
    appendTraceRow('ℹ️ AUDIT_LOGGED (CLASS 3)', `${ev.note} (Follow-up: ${ev.follow_up})`, tStr);
  } else if (ev.type === 'agent_summary') {
    appendTraceRow('CLINICAL_AUDIT_SUMMARY', ev.text, tStr, 't-summary');
  } else if (ev.type === 'done') {
    telStatus.textContent = `Completed in ${ev.elapsed_ms}ms`;
    telLatency.textContent = `${ev.elapsed_ms}ms`;
    step1TraceStatus.textContent = `Completed (${ev.elapsed_ms}ms)`;
    btnSimClass1.disabled = false;
    btnSimClass3.disabled = false;

    if (bulletinType === 'class1') {
      feedAmimoxStatus.textContent = `PROCESSED IN ${(ev.elapsed_ms / 1000).toFixed(2)}s`;
    }

    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
  } else if (ev.type === 'error') {
    appendTraceRow('ERROR', ev.message, tStr, 't-lockout');
  }
}

function appendTraceRow(title, body, timeStr, customClass = '') {
  const row = document.createElement('div');
  row.className = `t-event-row ${customClass}`;
  row.innerHTML = `<strong>[${escapeHtml(timeStr)}] ${escapeHtml(title)}:</strong> <span>${escapeHtml(body)}</span>`;
  traceConsoleStream.appendChild(row);
  traceConsoleStream.scrollTop = traceConsoleStream.scrollHeight;
}

function formatPayload(obj) {
  if (!obj) return '';
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

// --- Step 2: Distributed Edge Kill-Switch & Fleet Command Center ---
const containmentBadge = document.getElementById('containment-badge');
const containmentTime = document.getElementById('containment-time');
const regActiveCount = document.getElementById('reg-active-count');
const manualLockGtin = document.getElementById('manual-lock-gtin');
const manualLockLot = document.getElementById('manual-lock-lot');
const manualLockFacility = document.getElementById('manual-lock-facility');
const btnEngageManualLock = document.getElementById('btn-engage-manual-lock');
const activeLocksTbody = document.getElementById('active-locks-tbody');
const lockRowAmimox = document.getElementById('lock-row-amimox');
const lockLotsText = document.getElementById('lock-lots-text');
const badgeLockStatus = document.getElementById('badge-lock-status');
const btnReleaseLock = document.getElementById('btn-release-lock');

const fleetFilterPills = document.getElementById('fleet-filter-pills');
const erpStockStatusKarolinska = document.getElementById('erp-stock-status-karolinska');
const scannersKarolinska1 = document.getElementById('scanners-karolinska-1');
const scannersKarolinska2 = document.getElementById('scanners-karolinska-2');
const scannersSoder = document.getElementById('scanners-soder');
const scannersApoteket = document.getElementById('scanners-apoteket');

const erpControlCard = document.getElementById('erp-control-card');
const terminalSelector = document.getElementById('terminal-selector');
const btnSyncSap = document.getElementById('btn-sync-sap');
const btnBroadcastPos = document.getElementById('btn-broadcast-pos');
const btnResyncMesh = document.getElementById('btn-resync-mesh');
const step2LockoutAlert = document.getElementById('step2-lockout-alert');
const step2BtnScanA = document.getElementById('step2-btn-scan-a');
const step2BtnScanB = document.getElementById('step2-btn-scan-b');
const step2BtnScanC = document.getElementById('step2-btn-scan-c');
const step2LedgerTbody = document.getElementById('step2-ledger-tbody');

const lockoutModal = document.getElementById('lockout-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCopyInstallCmd = document.getElementById('btn-copy-install-cmd');

let isMeshLocked = true; // Initial demo state reflects Class 1 bulletin readiness

function setBranchTopologyLocked(isLocked, gtin = '07350012345678', lots = ['L9824B', 'L9824C']) {
  isMeshLocked = isLocked;
  const lotsList = Array.isArray(lots) ? lots : [lots];

  if (isLocked) {
    if (containmentBadge) {
      containmentBadge.className = 'containment-badge locked';
      containmentBadge.textContent = '100% CONTAINED: REGISTERS LOCKED · SAP S/4HANA BLOCKED';
    }
    if (containmentTime) {
      containmentTime.textContent = 'Fast Broadcast: 32ms via WebSocket / ZeroMQ Mesh';
    }

    if (erpStockStatusKarolinska) {
      erpStockStatusKarolinska.textContent = 'ERP Stock: 0001 (Active) ➔ 0004 (Blocked)';
    }

    if (scannersKarolinska1) {
      scannersKarolinska1.textContent = '4/4 Scanners LOCKED';
      scannersKarolinska1.className = 'child-detail locked';
    }
    if (scannersKarolinska2) {
      scannersKarolinska2.textContent = '2/2 Scanners LOCKED';
      scannersKarolinska2.className = 'child-detail locked';
    }
    if (scannersSoder) {
      scannersSoder.textContent = '6/6 Scanners LOCKED';
      scannersSoder.className = 'child-detail locked';
    }
    if (scannersApoteket) {
      scannersApoteket.textContent = '2/2 Scanners LOCKED';
      scannersApoteket.className = 'child-detail locked';
    }

    if (step2LockoutAlert) {
      step2LockoutAlert.classList.remove('hidden');
    }

    if (regActiveCount) {
      regActiveCount.textContent = `1 Active Lockout (${lotsList.length} Lots)`;
      regActiveCount.className = 'badge badge-danger';
    }

    if (lockLotsText) {
      lockLotsText.textContent = lotsList.join(', ');
    }

    if (badgeLockStatus) {
      badgeLockStatus.textContent = 'ENFORCED (32ms)';
      badgeLockStatus.className = 'badge badge-danger';
    }

    if (lockRowAmimox) {
      lockRowAmimox.style.display = '';
    }

    // Visual holy-cow moment: flash red border on control card
    if (erpControlCard) {
      erpControlCard.classList.remove('flash-alert');
      void erpControlCard.offsetWidth;
      erpControlCard.classList.add('flash-alert');
      setTimeout(() => {
        erpControlCard.classList.remove('flash-alert');
      }, 1600);
    }
  } else {
    if (containmentBadge) {
      containmentBadge.className = 'containment-badge';
      containmentBadge.textContent = 'STANDBY: 14 ENDPOINTS ACTIVE · SAP S/4HANA SYNCED';
    }
    if (containmentTime) {
      containmentTime.textContent = 'Fast Broadcast: 32ms via WebSocket / SSE Mesh';
    }

    if (erpStockStatusKarolinska) {
      erpStockStatusKarolinska.textContent = 'ERP Stock: 0001 (Active) · Normal Operations';
    }

    if (scannersKarolinska1) {
      scannersKarolinska1.textContent = '4/4 Scanners Operational';
      scannersKarolinska1.className = 'child-detail';
    }
    if (scannersKarolinska2) {
      scannersKarolinska2.textContent = '2/2 Scanners Operational';
      scannersKarolinska2.className = 'child-detail';
    }
    if (scannersSoder) {
      scannersSoder.textContent = '6/6 Scanners Operational';
      scannersSoder.className = 'child-detail';
    }
    if (scannersApoteket) {
      scannersApoteket.textContent = '2/2 Scanners Operational';
      scannersApoteket.className = 'child-detail';
    }

    if (step2LockoutAlert) {
      step2LockoutAlert.classList.add('hidden');
    }

    if (regActiveCount) {
      regActiveCount.textContent = '0 Active Lockouts';
      regActiveCount.className = 'badge badge-success';
    }

    if (badgeLockStatus) {
      badgeLockStatus.textContent = 'STANDBY (0 Active Locks)';
      badgeLockStatus.className = 'badge badge-success';
    }
  }
}

// Format and append rows to the Real-Time Terminal & Transaction Audit Stream
function appendAuditLedgerRow({ target, drug, lot, outcomeHtml, latency = '18ms' }) {
  if (!step2LedgerTbody) return;

  const emptyRow = step2LedgerTbody.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);

  tr.innerHTML = `
    <td class="mono-xs">${timeStr}</td>
    <td><span class="mono-xs bold">${escapeHtml(target)}</span></td>
    <td><strong>${escapeHtml(drug)}</strong> <span class="mono-xs text-muted">(${escapeHtml(lot)})</span></td>
    <td>${outcomeHtml}</td>
    <td><span class="mono-xs text-success bold">${escapeHtml(latency)}</span></td>
  `;
  step2LedgerTbody.prepend(tr);

  // Keep table capped to 20 rows
  while (step2LedgerTbody.children.length > 20) {
    step2LedgerTbody.removeChild(step2LedgerTbody.lastChild);
  }
}

// Seed initial authentic ledger history
function seedInitialAuditLedger() {
  appendAuditLedgerRow({
    target: 'Karolinska Solna (POS-01)',
    drug: 'Alvedon 500mg',
    lot: 'P4401Z',
    outcomeHtml: `<span class="badge badge-success">DISPENSED</span> <span class="mono-xs">Receipt #9281 · Stock -1 · SAP Loc 0001 Synced</span>`,
    latency: '16ms'
  });
  appendAuditLedgerRow({
    target: 'Mesh Broadcast (14 Nodes)',
    drug: 'Amimox 500mg',
    lot: 'L9824B',
    outcomeHtml: `<span class="badge badge-danger">⛔ 423 BLOCKED</span> <span class="mono-xs bold text-crimson">SAP Event Emitted: Moved to Quarantined Storage 0004</span>`,
    latency: '32ms'
  });
}
seedInitialAuditLedger();

// Fleet filter pills (All / POS / WMS / SAP ERP)
if (fleetFilterPills) {
  fleetFilterPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.fleet-tab');
    if (!btn) return;
    fleetFilterPills.querySelectorAll('.fleet-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;

    const facilityCards = document.querySelectorAll('.fleet-facility-card');
    facilityCards.forEach(card => {
      let visibleCount = 0;
      const rows = card.querySelectorAll('.fleet-node-row');
      rows.forEach(row => {
        const types = (row.dataset.type || '').split(' ');
        if (filter === 'all' || types.includes(filter)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });
      card.style.display = visibleCount > 0 ? '' : 'none';
    });
  });
}

// Node actions: ⚡ Ping & ⚠️ Force Quarantine
document.addEventListener('click', async (e) => {
  const pingBtn = e.target.closest('.btn-ping-node');
  if (pingBtn) {
    const nodeName = pingBtn.dataset.node || 'Node';
    const oldText = pingBtn.textContent;
    pingBtn.textContent = '⚡ ...';
    pingBtn.disabled = true;
    setTimeout(() => {
      const pingMs = Math.floor(Math.random() * 14) + 8;
      pingBtn.textContent = `✓ ${pingMs}ms`;
      appendAuditLedgerRow({
        target: nodeName,
        drug: 'Fleet Heartbeat',
        lot: 'PING_CHECK',
        outcomeHtml: `<span class="badge badge-success">200 OK</span> <span class="mono-xs">Duplex WebSocket ping ACK in ${pingMs}ms · Synchronized</span>`,
        latency: `${pingMs}ms`
      });
      setTimeout(() => {
        pingBtn.textContent = oldText;
        pingBtn.disabled = false;
      }, 1500);
    }, 200);
    return;
  }

  const quarBtn = e.target.closest('.btn-quarantine-node');
  if (quarBtn) {
    initAudio();
    const nodeName = quarBtn.dataset.node || 'Node';
    const isQuarantined = quarBtn.classList.contains('active-quarantined');
    if (!isQuarantined) {
      quarBtn.classList.add('active-quarantined');
      quarBtn.textContent = 'Release Node';
      quarBtn.classList.remove('btn-danger-outline');
      quarBtn.classList.add('btn-success');
      playBuzzer();
      appendAuditLedgerRow({
        target: nodeName,
        drug: 'Node Isolation',
        lot: 'FORCE_QUARANTINE',
        outcomeHtml: `<span class="badge badge-danger">ISOLATED</span> <span class="mono-xs bold text-crimson">Node manually severed by Safety Director · Dispensing Suspended</span>`,
        latency: '9ms'
      });
    } else {
      quarBtn.classList.remove('active-quarantined');
      quarBtn.textContent = 'Force Quarantine';
      quarBtn.classList.remove('btn-success');
      quarBtn.classList.add('btn-danger-outline');
      playScanChime();
      appendAuditLedgerRow({
        target: nodeName,
        drug: 'Node Isolation',
        lot: 'RESTORE_ONLINE',
        outcomeHtml: `<span class="badge badge-success">ONLINE</span> <span class="mono-xs">Node quarantine lifted · Normal dispensing resumed</span>`,
        latency: '11ms'
      });
    }
    return;
  }
});

// Manual item lockout injection
if (btnEngageManualLock) {
  btnEngageManualLock.addEventListener('click', async () => {
    initAudio();
    const gtin = (manualLockGtin?.value || '07350012345678').trim();
    const lot = (manualLockLot?.value || 'L9824B').trim();
    const facility = manualLockFacility?.options[manualLockFacility.selectedIndex]?.text || 'All Regional Endpoints';

    try {
      const resp = await fetch('/api/quarantine/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin, lots: [lot] })
      });
      const data = await resp.json();

      playBuzzer();
      setBranchTopologyLocked(true, gtin, [lot]);

      appendAuditLedgerRow({
        target: facility,
        drug: data.brand_name || 'Pharmaceutical Product',
        lot: lot,
        outcomeHtml: `<span class="badge badge-danger">MANUAL KILL-SWITCH</span> <span class="mono-xs bold text-crimson">Immediate fast-cache lock engaged across ${escapeHtml(facility)}</span>`,
        latency: '24ms'
      });
    } catch (err) {
      console.error('Manual lock error:', err);
    }
  });
}

// Release lock directive
if (btnReleaseLock) {
  btnReleaseLock.addEventListener('click', async () => {
    initAudio();
    const gtin = '07350012345678';
    try {
      const resp = await fetch('/api/quarantine/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin })
      });
      const data = await resp.json();

      playScanChime();
      setBranchTopologyLocked(false);

      appendAuditLedgerRow({
        target: 'All Regional Endpoints (14 Nodes)',
        drug: 'Amimox 500mg',
        lot: 'ALL LOTS',
        outcomeHtml: `<span class="badge badge-success">LOCK RELEASED</span> <span class="mono-xs">Quarantine directive released · Normal dispensing restored</span>`,
        latency: '18ms'
      });
    } catch (err) {
      console.error('Release lock error:', err);
    }
  });
}

// ERP Action: Push Stock Mutation to SAP S/4HANA
if (btnSyncSap) {
  btnSyncSap.addEventListener('click', () => {
    initAudio();
    const oldText = btnSyncSap.innerHTML;
    btnSyncSap.innerHTML = '<span>🚀 Syncing SAP RFC...</span>';
    btnSyncSap.disabled = true;

    setTimeout(() => {
      playScanChime();
      btnSyncSap.innerHTML = oldText;
      btnSyncSap.disabled = false;
      appendAuditLedgerRow({
        target: 'SAP S/4HANA (Storage Loc 0004)',
        drug: 'Amimox 500mg (L9824B, L9824C)',
        lot: 'BAPI_GOODSMVT_CREATE',
        outcomeHtml: `<span class="badge badge-primary">SAP COMMITTED</span> <span class="mono-xs bold">Movement Type 344 · 3,280 Units Moved: 0001 ➔ 0004 (Blocked)</span>`,
        latency: '48ms'
      });
    }, 400);
  });
}

// ERP Action: Broadcast Lockout to POS Mesh
if (btnBroadcastPos) {
  btnBroadcastPos.addEventListener('click', () => {
    initAudio();
    const oldText = btnBroadcastPos.innerHTML;
    btnBroadcastPos.innerHTML = '<span>⚡ Broadcasting to Mesh...</span>';
    btnBroadcastPos.disabled = true;

    setTimeout(() => {
      playBuzzer();
      btnBroadcastPos.innerHTML = oldText;
      btnBroadcastPos.disabled = false;
      setBranchTopologyLocked(true);
      appendAuditLedgerRow({
        target: 'POS Mesh (14 Registers)',
        drug: 'Amimox 500mg',
        lot: 'ALL RECALLED LOTS',
        outcomeHtml: `<span class="badge badge-danger">MESH ENFORCED</span> <span class="mono-xs bold text-crimson">ZeroMQ/WS hardware lockout pushed to 14 daemons · 14/14 ACK received</span>`,
        latency: '28ms'
      });
    }, 350);
  });
}

// ERP Action: Re-Sync Inventory Mesh
if (btnResyncMesh) {
  btnResyncMesh.addEventListener('click', () => {
    initAudio();
    const oldText = btnResyncMesh.innerHTML;
    btnResyncMesh.innerHTML = '<span>🔄 Auditing Inventory Mesh...</span>';
    btnResyncMesh.disabled = true;

    setTimeout(() => {
      playScanChime();
      btnResyncMesh.innerHTML = oldText;
      btnResyncMesh.disabled = false;
      appendAuditLedgerRow({
        target: 'Inventory Mesh Gateway',
        drug: 'Central Inventory Ledger',
        lot: 'CHECKSUM_AUDIT',
        outcomeHtml: `<span class="badge badge-info">MESH AUDITED</span> <span class="mono-xs">Verified 3 facilities, 14 POS daemons, 2 WMS instances · 0 anomalies</span>`,
        latency: '34ms'
      });
    }, 380);
  });
}

// Rapid Audit Test Buttons (Replacing old barcode scanner simulator)
function getSelectedTargetName() {
  if (!terminalSelector) return 'Karolinska Solna (POS-01)';
  const opt = terminalSelector.options[terminalSelector.selectedIndex];
  return opt ? opt.text : 'Karolinska Solna (POS-01)';
}

if (step2BtnScanA) {
  step2BtnScanA.addEventListener('click', async () => {
    initAudio();
    const gtin = '07350012345678';
    const lot = 'L1100A';
    const target = getSelectedTargetName();

    try {
      const resp = await fetch(`/api/pos/scan?gtin=${encodeURIComponent(gtin)}&lot=${encodeURIComponent(lot)}`, {
        method: 'POST'
      });
      const data = await resp.json();
      playScanChime();
      appendAuditLedgerRow({
        target,
        drug: data.brand_name || 'Amimox 500mg',
        lot,
        outcomeHtml: `<span class="badge badge-success">DISPENSED</span> <span class="mono-xs">Receipt #${Math.floor(1000 + Math.random() * 9000)} · Stock -1 · SAP Loc 0001 (Active)</span>`,
        latency: '14ms'
      });
    } catch (err) {
      console.error('Scan error:', err);
    }
  });
}

if (step2BtnScanB) {
  step2BtnScanB.addEventListener('click', async () => {
    initAudio();
    const gtin = '07350012345678';
    const lot = 'L9824B';
    const target = getSelectedTargetName();

    try {
      const resp = await fetch(`/api/pos/scan?gtin=${encodeURIComponent(gtin)}&lot=${encodeURIComponent(lot)}`, {
        method: 'POST'
      });
      const data = await resp.json();

      if (resp.status === 423) {
        playBuzzer();
        setBranchTopologyLocked(true);
        if (lockoutModal) lockoutModal.classList.remove('hidden');

        appendAuditLedgerRow({
          target,
          drug: data.brand_name || 'Amimox 500mg',
          lot,
          outcomeHtml: `<span class="badge badge-danger">⛔ 423 BLOCKED</span> <span class="mono-xs bold text-crimson">SAP Event Emitted: Moved to Quarantined Storage 0004 · Dispense Prevented</span>`,
          latency: '26ms'
        });
      } else {
        playScanChime();
        appendAuditLedgerRow({
          target,
          drug: data.brand_name || 'Amimox 500mg',
          lot,
          outcomeHtml: `<span class="badge badge-success">DISPENSED</span> <span class="mono-xs">Receipt #${Math.floor(1000 + Math.random() * 9000)} · Stock -1 · SAP Loc 0001</span>`,
          latency: '15ms'
        });
      }
    } catch (err) {
      console.error('Scan error:', err);
    }
  });
}

if (step2BtnScanC) {
  step2BtnScanC.addEventListener('click', async () => {
    initAudio();
    const gtin = '07350099999999';
    const lot = 'P4401Z';
    const target = getSelectedTargetName();

    try {
      const resp = await fetch(`/api/pos/scan?gtin=${encodeURIComponent(gtin)}&lot=${encodeURIComponent(lot)}`, {
        method: 'POST'
      });
      const data = await resp.json();
      playScanChime();
      appendAuditLedgerRow({
        target,
        drug: data.brand_name || 'Alvedon 500mg',
        lot,
        outcomeHtml: `<span class="badge badge-success">DISPENSED</span> <span class="mono-xs">Receipt #${Math.floor(1000 + Math.random() * 9000)} · Packaging audit note logged · SAP Loc 0001</span>`,
        latency: '16ms'
      });
    } catch (err) {
      console.error('Scan error:', err);
    }
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener('click', () => {
    if (lockoutModal) lockoutModal.classList.add('hidden');
  });
}

// Copy edge daemon install command in settings drawer
if (btnCopyInstallCmd) {
  btnCopyInstallCmd.addEventListener('click', () => {
    const cmd = 'curl -sSL https://firebreak.io/install-pos.sh | bash -s -- --token=fbf_live_9921_karolinska_solna';
    navigator.clipboard.writeText(cmd).then(() => {
      const orig = btnCopyInstallCmd.textContent;
      btnCopyInstallCmd.textContent = '✓ Copied to Clipboard!';
      setTimeout(() => { btnCopyInstallCmd.textContent = orig; }, 1600);
    }).catch(err => {
      console.warn('Clipboard write failed:', err);
    });
  });
}

// --- Step 3: Depletion & Calculus View Updates ---
const faUsable = document.getElementById('fa-usable');
const faDays = document.getElementById('fa-days');
const faKarolinskaStatus = document.getElementById('fa-karolinska-status');
const deficitTag = document.getElementById('deficit-tag');

function updateDepletionView(inv) {
  faUsable.textContent = `${inv.usable_units.toLocaleString()} units`;
  faDays.textContent = `${inv.days_remaining} Days`;

  if (inv.days_remaining <= 4.0) {
    faKarolinskaStatus.className = 'badge badge-danger';
    faKarolinskaStatus.textContent = 'CRITICAL STOCKOUT';
    deficitTag.textContent = 'CRITICAL SHORTAGE WITHIN 72 HOURS';
    deficitTag.className = 'badge badge-danger';
  } else {
    faKarolinskaStatus.className = 'badge badge-success';
    faKarolinskaStatus.textContent = 'RESERVE NOMINAL';
    deficitTag.textContent = 'REGIONAL RESERVE PROTECTED';
    deficitTag.className = 'badge badge-success';
  }
}

// --- Step 4: Sourcing & PO View Updates ---
const step4PoId = document.getElementById('step4-po-id');
const step4PoVolume = document.getElementById('step4-po-volume');
const step4PoCost = document.getElementById('step4-po-cost');
const step4RationaleText = document.getElementById('step4-rationale-text');
const btnStep4Approve = document.getElementById('btn-step4-approve');
let currentStagedPoId = 'PO-2026-0912';

function updateProcurementView(po) {
  currentStagedPoId = po.po_id;
  step4PoId.textContent = po.po_id;
  step4PoVolume.textContent = `${po.requested_units.toLocaleString()} Units`;
  step4PoCost.textContent = `${po.estimated_cost_sek.toLocaleString()} SEK`;
  step4RationaleText.textContent = po.audit_rationale;

  btnStep4Approve.disabled = false;
  btnStep4Approve.className = 'btn btn-hero-approve';
  btnStep4Approve.textContent = '✓ One-Click Authorize & Send (EDI Dispatch)';
}

btnStep4Approve.addEventListener('click', async () => {
  initAudio();
  if (btnStep4Approve.disabled) return;

  try {
    const resp = await fetch(`/api/po/approve?po_id=${encodeURIComponent(currentStagedPoId)}`, {
      method: 'POST'
    });
    if (resp.ok) {
      playScanChime();
      btnStep4Approve.disabled = true;
      btnStep4Approve.className = 'btn btn-hero-approve approved';
      btnStep4Approve.textContent = '✓ PO-2026-0912 TRANSMITTED VIA EDI TO TAMRO AB';

      stepStatus4.textContent = 'Dispatched';
      stepStatus3.textContent = '14.0d (Protected)';
      stepTab4.classList.remove('has-alert');
      stepTab3.classList.remove('has-alert');

      // Update depletion to nominal 14 days
      faDays.textContent = '14.0 Days';
      faKarolinskaStatus.className = 'badge badge-success';
      faKarolinskaStatus.textContent = 'RESERVE RESTORED';
      deficitTag.className = 'badge badge-success';
      deficitTag.textContent = 'RESERVE SECURED: 14.0 DAYS VIA TAMRO EDI';
    }
  } catch (err) {
    console.error('Failed to approve PO:', err);
  }
});

// --- Reset All State ---
const btnReset = document.getElementById('btn-reset');

btnReset.addEventListener('click', async () => {
  initAudio();
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  try {
    const resp = await fetch('/api/reset', { method: 'POST' });
    if (resp.ok) {
      // Clear alerts on stepper
      stepButtons.forEach(btn => btn.classList.remove('has-alert'));
      stepStatus1.textContent = 'Feeds Live';
      stepStatus2.textContent = 'Ready';
      stepStatus3.textContent = '11.4d Stock';
      stepStatus4.textContent = 'Standby';

      // Reset Step 1
      clearStagedFile();
      if (sourcesModalBackdrop) sourcesModalBackdrop.classList.add('hidden');
      telStatus.textContent = 'Standby';
      telLatency.textContent = '120ms';
      step1TraceStatus.textContent = 'Standby';
      traceConsoleStream.innerHTML = `
        <div class="trace-empty-state">
          <span>⚡ Click "Simulate Class 1 Recall" above to observe Gemini's tool-calling sequence in real time.</span>
        </div>
      `;

      // Reset Step 2
      setBranchTopologyLocked(false);
      lockoutModal.classList.add('hidden');

      // Reset Step 3
      faUsable.textContent = '4,560 units';
      faDays.textContent = '11.4 Days';
      faKarolinskaStatus.className = 'badge badge-success';
      faKarolinskaStatus.textContent = 'RESERVE NOMINAL';
      deficitTag.className = 'badge badge-danger';
      deficitTag.textContent = 'CRITICAL SHORTAGE WITHIN 72 HOURS';

      // Reset Step 4
      btnStep4Approve.disabled = false;
      btnStep4Approve.className = 'btn btn-hero-approve';
      btnStep4Approve.textContent = '✓ One-Click Authorize & Send (EDI Dispatch)';

      // Return to Step 1
      goToStep(1);

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
