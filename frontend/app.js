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

    setBranchTopologyLocked(true);
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

// --- Step 2: Branch Topology & Interactive Scanner ---
const containmentBadge = document.getElementById('containment-badge');
const containmentTime = document.getElementById('containment-time');
const badgeKarolinska = document.getElementById('badge-karolinska');
const badgeSoder = document.getElementById('badge-soder');
const badgeApoteket = document.getElementById('badge-apoteket');
const scannersKarolinska1 = document.getElementById('scanners-karolinska-1');
const scannersKarolinska2 = document.getElementById('scanners-karolinska-2');
const scannersSoder = document.getElementById('scanners-soder');
const scannersApoteket = document.getElementById('scanners-apoteket');
const lockoutHeroBanner = document.getElementById('lockout-hero-banner');
const step2LedgerTbody = document.getElementById('step2-ledger-tbody');

const lockoutModal = document.getElementById('lockout-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

function setBranchTopologyLocked(isLocked) {
  if (isLocked) {
    containmentBadge.className = 'containment-badge locked';
    containmentBadge.textContent = '100% CONTAINED: REGISTERS LOCKED';
    containmentTime.textContent = 'Broadcast Execution: 32ms · SSE Duplex Broadcast';

    badgeKarolinska.className = 'tree-status-badge status-locked';
    badgeKarolinska.textContent = 'LOCKED (6 SCANNERS)';
    scannersKarolinska1.textContent = '4/4 Scanners LOCKED';
    scannersKarolinska1.className = 'child-detail locked';
    scannersKarolinska2.textContent = '2/2 Scanners LOCKED';
    scannersKarolinska2.className = 'child-detail locked';

    badgeSoder.className = 'tree-status-badge status-locked';
    badgeSoder.textContent = 'LOCKED (6 SCANNERS)';
    scannersSoder.textContent = '6/6 Scanners LOCKED';
    scannersSoder.className = 'child-detail locked';

    badgeApoteket.className = 'tree-status-badge status-locked';
    badgeApoteket.textContent = 'LOCKED (2 SCANNERS)';
    scannersApoteket.textContent = '2/2 Scanners LOCKED';
    scannersApoteket.className = 'child-detail locked';

    lockoutHeroBanner.classList.remove('hidden');
  } else {
    containmentBadge.className = 'containment-badge';
    containmentBadge.textContent = 'STANDBY: REGISTERS ACTIVE';
    containmentTime.textContent = 'Broadcast Latency: 32ms via SSE Duplex Push';

    badgeKarolinska.className = 'tree-status-badge status-open';
    badgeKarolinska.textContent = 'ACTIVE (6 SCANNERS)';
    scannersKarolinska1.textContent = '4/4 Scanners Operational';
    scannersKarolinska1.className = 'child-detail';
    scannersKarolinska2.textContent = '2/2 Scanners Operational';
    scannersKarolinska2.className = 'child-detail';

    badgeSoder.className = 'tree-status-badge status-open';
    badgeSoder.textContent = 'ACTIVE (6 SCANNERS)';
    scannersSoder.textContent = '6/6 Scanners Operational';
    scannersSoder.className = 'child-detail';

    badgeApoteket.className = 'tree-status-badge status-open';
    badgeApoteket.textContent = 'ACTIVE (2 SCANNERS)';
    scannersApoteket.textContent = '2/2 Scanners Operational';
    scannersApoteket.className = 'child-detail';

    lockoutHeroBanner.classList.add('hidden');
  }
}

function setupScannerCard(boxId, btnId, laserId) {
  const box = document.getElementById(boxId);
  const btn = document.getElementById(btnId);
  const laser = document.getElementById(laserId);
  const gtin = box.dataset.gtin;
  const lot = box.dataset.lot;

  const performScan = async () => {
    initAudio();

    // Laser beam animation
    laser.classList.remove('scanning');
    void laser.offsetWidth;
    laser.classList.add('scanning');

    try {
      const resp = await fetch(`/api/pos/scan?gtin=${encodeURIComponent(gtin)}&lot=${encodeURIComponent(lot)}`, {
        method: 'POST'
      });
      const data = await resp.json();

      if (resp.status === 200) {
        playScanChime();
        appendScanRow(data, true);
      } else if (resp.status === 423) {
        playBuzzer();
        lockoutHeroBanner.classList.remove('hidden');
        lockoutModal.classList.remove('hidden');
        appendScanRow(data, false);
      } else {
        appendScanRow(data, false);
      }
    } catch (err) {
      console.error('Scan error:', err);
    }
  };

  box.addEventListener('click', performScan);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    performScan();
  });
}

setupScannerCard('step2-box-a', 'step2-btn-scan-a', 'step2-laser-a');
setupScannerCard('step2-box-b', 'step2-btn-scan-b', 'step2-laser-b');
setupScannerCard('step2-box-c', 'step2-btn-scan-c', 'step2-laser-c');

function appendScanRow(item, isApproved) {
  const emptyRow = step2LedgerTbody.querySelector('.empty-row');
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
      <span class="${isApproved ? 'badge badge-success' : 'badge badge-danger'}">
        ${isApproved ? 'APPROVED' : '423 LOCKED'}
      </span>
    </td>
  `;
  step2LedgerTbody.prepend(tr);
}

btnCloseModal.addEventListener('click', () => {
  lockoutModal.classList.add('hidden');
});

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
