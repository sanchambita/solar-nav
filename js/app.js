// ============================================================
// SOLAR NAV - App Controller
// UI interactions, rendering, charts, WhatsApp, PDF
// ============================================================

// ---------- Toast System (M1.2) ----------
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  fetchBNADollar();
  // Cargar datos desde Google Sheet (si esta configurado)
  await loadFromSheet();
  populateProvinces();
  populateTariffs();
  populateEquipment();
  renderProducts();
  setupUpload();
  checkAI();
  setupProgressTracking();
  incrementVisitCounter();
});

// ---------- BNA Dollar Rate ----------
async function fetchBNADollar() {
  try {
    const res = await fetch('/api/dollar');
    const data = await res.json();
    if (data.venta) {
      CONFIG.dollarRate = data.venta;
      const el = document.getElementById('dollar-rate');
      if (el) el.textContent = 'Dólar BNA: $' + data.venta.toLocaleString('es-AR');
    }
  } catch (e) {
    console.warn('No se pudo obtener dólar BNA, usando valor por defecto:', CONFIG.dollarRate);
  }
}

// ---------- Province selector ----------
function populateProvinces() {
  const sel = document.getElementById('province');
  PROVINCES.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    const prov = PROVINCES.find(p => p.id === sel.value);
    const info = document.getElementById('hsp-info');
    const val = document.getElementById('hsp-value');
    if (prov) {
      val.textContent = prov.hsp;
      info.style.display = 'block';
      updateProgress(1, true);
    } else {
      info.style.display = 'none';
    }
  });
}

// ---------- Tariff selector ----------
function populateTariffs() {
  const sel = document.getElementById('tariff');
  TARIFFS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

// ---------- Equipment selectors ----------
function populateEquipment() {
  const products = getProducts();

  // Panels
  const panelSel = document.getElementById('panel-select');
  if (!panelSel) return;
  products.filter(p => p.category === 'panel').sort((a, b) => b.watts - a.watts).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.watts + 'W ' + p.brand + ' — ' + formatARS(calcFinalPriceARS(p));
    panelSel.appendChild(opt);
  });

  // Inverters (all types)
  const invSel = document.getElementById('inverter-select');
  products.filter(p => (p.category === 'inversor' || p.category === 'inversor-offgrid' || p.category === 'inversor-hibrido') && p.watts)
    .sort((a, b) => a.watts - b.watts).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const kw = p.watts >= 1000 ? (p.watts/1000) + 'kW' : p.watts + 'W';
      const cat = p.category === 'inversor' ? '' : p.category === 'inversor-hibrido' ? ' [Hibrido]' : ' [Off-Grid]';
      opt.textContent = kw + ' ' + p.brand + cat + ' — ' + formatARS(calcFinalPriceARS(p));
      invSel.appendChild(opt);
    });

  // Show equipment step
  document.getElementById('equipment-step').style.display = 'block';
}

// ---------- Equipment toggle (M1.4) ----------
function toggleEquipment() {
  const toggle = document.getElementById('equipment-toggle');
  const content = document.getElementById('equipment-content');
  toggle.classList.toggle('open');
  content.classList.toggle('open');
}

// ---------- Progress bar (M3.1) ----------
let progressState = [false, false, false, false];

function setupProgressTracking() {
  // Track province change
  document.getElementById('province').addEventListener('change', () => updateProgress(1, true));

  // Track consumption input
  const kwhInput = document.getElementById('input-kwh');
  const moneyInput = document.getElementById('input-money');
  if (kwhInput) kwhInput.addEventListener('input', () => { if (kwhInput.value) updateProgress(2, true); });
  if (moneyInput) moneyInput.addEventListener('input', () => { if (moneyInput.value) updateProgress(2, true); });
}

function updateProgress(step, done) {
  progressState[step - 1] = done;

  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById('wp-' + i);
    const lineEl = document.getElementById('wpl-' + (i - 1));

    stepEl.classList.remove('active', 'done');
    if (progressState[i - 1]) {
      stepEl.classList.add('done');
      if (lineEl) lineEl.classList.add('done');
    } else {
      // First incomplete step is active
      const prevDone = i === 1 || progressState[i - 2];
      if (prevDone) stepEl.classList.add('active');
      if (lineEl && !progressState[i - 2]) lineEl.classList.remove('done');
    }
  }
}

// ---------- Entry mode (auto/manual) ----------
let entryMode = 'auto';
let currentMode = 'kwh';
let currentSystemType = 'ongrid';
let currentResult = null;
let currentPanelOverride = null;
let currentPhaseType = 'mono';
let currentRoofType = 'chapa';
let currentMaxPowerKw = 10;
let currentBillData = null;
let currentBillImage = null; // base64 de la factura subida
let leadSubmitted = false;

function setEntryMode(mode) {
  entryMode = mode;
  document.getElementById('mode-btn-auto').classList.toggle('active', mode === 'auto');
  document.getElementById('mode-btn-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('entry-auto').style.display = mode === 'auto' ? 'block' : 'none';
  document.getElementById('entry-manual').style.display = mode === 'manual' ? 'block' : 'none';
}

// ---------- Input mode toggle (within manual) ----------
function setInputMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.input-toggle button').forEach((btn, i) => {
    btn.classList.toggle('active', ['kwh', 'money'][i] === mode);
  });
  document.getElementById('mode-kwh').style.display = mode === 'kwh' ? 'block' : 'none';
  document.getElementById('mode-money').style.display = mode === 'money' ? 'block' : 'none';
}

// ---------- System type selector ----------
function setSystemType(type) {
  currentSystemType = type;
  ['ongrid', 'hybrid', 'offgrid'].forEach(t => {
    document.getElementById('sys-' + t).classList.toggle('active', t === type);
  });

  const battOpts = document.getElementById('battery-options');
  const critGroup = document.getElementById('critical-load-group');
  battOpts.style.display = type === 'ongrid' ? 'none' : 'block';
  critGroup.style.display = type === 'ongrid' ? 'none' : 'block';

  const slider = document.getElementById('autonomy-hours');
  slider.value = 24;
  document.getElementById('autonomy-val').textContent = 24;

  updateProgress(3, true);
}

// ---------- Phase type selector (mono/tri) ----------
function setPhaseType(phase) {
  currentPhaseType = phase;
  document.getElementById('phase-type').value = phase;
  // Update all phase buttons
  ['phase-mono', 'phase-tri', 'manual-phase-mono', 'manual-phase-tri'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id.includes(phase));
  });
}

// ---------- Roof type selector ----------
function setRoofType(type) {
  currentRoofType = type;
  ['chapa', 'teja', 'losa'].forEach(t => {
    const el = document.getElementById('roof-' + t);
    if (el) el.classList.toggle('active', t === type);
  });
}

// ---------- Panel adjuster ----------
function adjustPanels(delta) {
  if (!currentResult) return;
  const newCount = Math.max(1, currentResult.numPanels + delta);
  currentPanelOverride = newCount;
  runCalculation();
}

// ---------- AI integration ----------
async function checkAI() {
  const statusEl = document.getElementById('ollama-status');
  statusEl.innerHTML = '<span class="ollama-status connected">IA lista para analizar facturas</span>';
}

// ---------- File upload ----------
function setupUpload() {
  const area = document.getElementById('upload-area');
  const fileInput = document.getElementById('bill-file');

  area.addEventListener('click', () => fileInput.click());
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) processFile(fileInput.files[0]);
  });
}

function resetCalculator() {
  // Reset globals
  currentResult = null;
  currentPanelOverride = null;
  currentPhaseType = 'mono';
  currentRoofType = 'chapa';
  currentMaxPowerKw = 10;
  currentBillData = null;
  currentBillImage = null;

  // Hide results
  document.getElementById('results').classList.remove('visible');

  // Hide/reset bill result
  const billResult = document.getElementById('bill-result');
  if (billResult) billResult.style.display = 'none';
  const billExtracted = document.getElementById('bill-extracted');
  if (billExtracted) billExtracted.innerHTML = '';

  // Hide phase question and power limit
  const phaseQ = document.getElementById('phase-question');
  if (phaseQ) phaseQ.style.display = 'none';
  const powerLimit = document.getElementById('power-limit-info');
  if (powerLimit) powerLimit.style.display = 'none';

  // Reset hidden inputs
  document.getElementById('phase-type').value = 'mono';
  document.getElementById('max-power-kw').value = 10;

  // Reset auto fields
  const autoKwh = document.getElementById('auto-kwh');
  if (autoKwh) autoKwh.value = '';
  const autoTariff = document.getElementById('auto-tariff');
  if (autoTariff) autoTariff.value = '';

  // Reset file input so same file can be re-selected
  const fileInput = document.getElementById('bill-file');
  if (fileInput) fileInput.value = '';

  // Reset loading
  const loading = document.getElementById('calc-loading');
  if (loading) loading.style.display = 'none';

  // Reset calc button
  const calcBtn = document.getElementById('calc-btn');
  if (calcBtn) { calcBtn.disabled = false; calcBtn.textContent = 'Cotiza tu sistema'; }

  // Reset progress
  progressState = [false, false, false, false];
  for (let i = 1; i <= 4; i++) updateProgress(i, false);
}

async function processFile(file) {
  resetCalculator();
  const area = document.getElementById('upload-area');

  // Validar tipo de archivo
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const mimeType = file.type || '';
  if (!validTypes.includes(mimeType)) {
    area.innerHTML = '<div class="upload-icon">&#10060;</div><p>Formato no soportado</p><p style="font-size:0.8rem; color:var(--text-muted);">Usa JPG, PNG o PDF</p>';
    return;
  }

  // Validar tamaño (10MB)
  if (file.size > 10 * 1024 * 1024) {
    area.innerHTML = '<div class="upload-icon">&#10060;</div><p>Archivo muy grande (max 10MB)</p><p style="font-size:0.8rem; color:var(--text-muted);">Intenta con una foto de menor resolucion</p>';
    return;
  }

  const isPdf = mimeType === 'application/pdf';
  area.innerHTML = '<div class="upload-icon">&#9203;</div><p>Analizando factura con IA...</p><p style="font-size:0.8rem; color:var(--text-muted);">' + (isPdf ? 'Convirtiendo PDF a imagen...' : 'Unos segundos...') + '</p>';

  try {
    let b64data, sendMime;

    if (isPdf) {
      // Convert PDF to JPEG in browser so Groq can process it
      const jpegDataUrl = await pdfToImage(file);
      b64data = jpegDataUrl.split(',')[1];
      sendMime = 'image/jpeg';
      area.innerHTML = '<div class="upload-icon">&#9203;</div><p>Analizando factura con IA...</p><p style="font-size:0.8rem; color:var(--text-muted);">Enviando a Groq...</p>';
    } else {
      const base64 = await fileToBase64(file);
      b64data = base64.split(',')[1];
      sendMime = mimeType;
    }

    // Guardar imagen de factura para enviar por email
    currentBillImage = b64data;

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64data, mimeType: sendMime }),
    });

    const data = await response.json();

    if (!response.ok) {
      const retryable = data.retryable || response.status === 503 || response.status === 429;
      const err = new Error(data.error || 'Error al analizar');
      err.retryable = retryable;
      throw err;
    }

    showBillResult(data.result);
    autoFillFromBill(data.result);
    updateProgress(2, true);
  } catch (err) {
    let hint = 'Intenta con otra foto/PDF o usa el modo manual';
    if (err.retryable) {
      hint = 'El servicio de IA esta saturado. Intenta de nuevo en unos segundos.';
    }
    area.innerHTML = '<div class="upload-icon">&#10060;</div><p>' + esc(err.message) + '</p>'
      + '<p style="font-size:0.8rem; color:var(--text-muted);">' + hint + '</p>'
      + '<button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" onclick="document.getElementById(\'bill-file\').click()">Reintentar</button>';
  }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function showBillResult(data) {
  const area = document.getElementById('upload-area');
  area.innerHTML = '<div class="upload-icon">&#9989;</div><p><strong>Factura analizada correctamente</strong></p>';

  const resultDiv = document.getElementById('bill-result');
  const extractedDiv = document.getElementById('bill-extracted');

  const row = (label, value) => '<div class="cost-row"><span>' + esc(label) + '</span><span>' + esc(value) + '</span></div>';

  let html = '';
  if (data.proveedor) html += row('Proveedor', data.proveedor);
  if (data.tarifa) html += row('Tarifa', data.tarifa);
  if (data.tipo_tarifa) html += row('Tipo', data.tipo_tarifa + (data.actividad ? ' — ' + data.actividad : ''));
  if (data.consumo_kwh) html += row('Consumo', data.consumo_kwh + ' kWh');
  if (data.dias_periodo) html += row('Dias periodo', data.dias_periodo + ' días');
  if (data.monto_total) html += row('Total a pagar', formatARS(data.monto_total));
  if (data.cargo_fijo) html += row('Cargo fijo', formatARS(data.cargo_fijo));
  if (data.cargo_variable_1) html += row('Cargo variable 1', formatARS(data.cargo_variable_1));
  if (data.cargo_variable_2) html += row('Cargo variable 2', formatARS(data.cargo_variable_2));
  if (data.conceptos_electricos) html += row('Conceptos electricos', formatARS(data.conceptos_electricos));
  if (data.impuestos) html += row('Impuestos', formatARS(data.impuestos));
  if (data.subsidio) html += row('Subsidio', formatARS(data.subsidio));
  if (data.nivel_subsidio) html += row('Nivel subsidio', data.nivel_subsidio);
  if (data.periodo) html += row('Periodo', data.periodo);
  if (data.titular) html += row('Titular', data.titular);
  if (data.direccion) html += row('Direccion', data.direccion);
  if (data.localidad) html += row('Localidad', data.localidad);
  if (data.provincia) html += row('Provincia', data.provincia);
  if (data.numero_cuenta) html += row('Cuenta', data.numero_cuenta);

  extractedDiv.innerHTML = html;
  resultDiv.style.display = 'block';
}

// ---------- Auto-fill from bill ----------
function autoFillFromBill(data) {
  if (data.consumo_kwh) {
    const kwh = Math.round(data.consumo_kwh);
    document.getElementById('auto-kwh').value = kwh;
    document.getElementById('input-kwh').value = kwh;
  }

  const provider = (data.proveedor || '').toLowerCase();
  const tipo = (data.tipo_tarifa || 'T1').toUpperCase();
  const actividad = (data.actividad || '').toLowerCase();

  let bestMatch = '';

  for (const tariff of TARIFFS) {
    const providerMatch = tariff.provider && provider.includes(tariff.provider);
    if (!providerMatch) continue;
    if (tariff.type !== tipo) continue;

    if (tipo === 'T1') {
      const isResidencial = actividad.includes('residen') || actividad === '';
      const isResTariff = tariff.id.includes('-res');
      if (isResidencial && isResTariff) { bestMatch = tariff.id; break; }
      if (!isResidencial && !isResTariff) { bestMatch = tariff.id; break; }
      if (!bestMatch) bestMatch = tariff.id;
    } else {
      bestMatch = tariff.id;
      break;
    }
  }

  let autoTariff = document.getElementById('auto-tariff');
  if (!autoTariff) {
    autoTariff = document.createElement('input');
    autoTariff.type = 'hidden';
    autoTariff.id = 'auto-tariff';
    document.getElementById('entry-auto').appendChild(autoTariff);
  }
  autoTariff.value = bestMatch;

  if (bestMatch) {
    document.getElementById('tariff').value = bestMatch;
  }

  if (bestMatch) {
    const matchedTariff = TARIFFS.find(t => t.id === bestMatch);
    if (matchedTariff) {
      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = 'margin-top:0.8rem; padding:0.6rem 1rem; background:var(--accent-glow); border-radius:8px; font-size:0.9rem; color:var(--accent);';
      infoDiv.innerHTML = '<strong>Tarifa detectada:</strong> ' + matchedTariff.name;
      document.getElementById('bill-extracted').appendChild(infoDiv);
    }
  }

  // Show phase question and power limit based on tariff type
  const detectedType = tipo; // T1, T2, T3

  if (detectedType === 'T1') {
    // T1: max 10kW, ask mono/tri
    currentMaxPowerKw = 10;
    document.getElementById('max-power-kw').value = 10;
    const phaseQ = document.getElementById('phase-question');
    if (phaseQ) phaseQ.style.display = 'block';
    document.getElementById('power-limit-info').style.display = 'none';
  } else {
    // T2/T3: always trifásico, power limit from bill
    setPhaseType('tri');
    const potencia = data.potencia_contratada;
    if (potencia && potencia > 0) {
      currentMaxPowerKw = potencia;
      document.getElementById('max-power-kw').value = potencia;
      const limitInfo = document.getElementById('power-limit-info');
      if (limitInfo) {
        document.getElementById('power-limit-value').textContent = potencia;
        limitInfo.style.display = 'block';
      }
    } else {
      // Default power limits for T2/T3 if not detected
      currentMaxPowerKw = detectedType === 'T2' ? 50 : 300;
      document.getElementById('max-power-kw').value = currentMaxPowerKw;
    }
    // Hide phase question (T2/T3 is always tri)
    const phaseQ = document.getElementById('phase-question');
    if (phaseQ) phaseQ.style.display = 'none';
    const limitInfo = document.getElementById('power-limit-info');
    if (limitInfo) {
      document.getElementById('power-limit-value').textContent = currentMaxPowerKw;
      limitInfo.style.display = 'block';
    }
  }

  // Store bill data
  currentBillData = data;

  const provinceSel = document.getElementById('province');
  const billProvincia = (data.provincia || '').toLowerCase();
  const billLocalidad = (data.localidad || '').toLowerCase();
  const billDireccion = (data.direccion || '').toLowerCase();
  const locationText = billProvincia + ' ' + billLocalidad + ' ' + billDireccion;

  let matchedProvince = '';

  for (const p of PROVINCES) {
    const pName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const locNorm = locationText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (locNorm.includes(pName) || locNorm.includes(p.id)) {
      matchedProvince = p.id;
      break;
    }
  }

  if (!matchedProvince) {
    if (provider.includes('edenor') || provider.includes('edesur')) matchedProvince = 'bsas';
    else if (provider.includes('epec')) matchedProvince = 'cordoba';
    else if (provider.includes('epe ') || provider.includes('epe santa')) matchedProvince = 'santafe';
    else if (provider.includes('eden') || provider.includes('edes')) matchedProvince = 'bsas';
    else if (provider.includes('edelap')) matchedProvince = 'bsas';
    else if (provider.includes('emsa')) matchedProvince = 'misiones';
    else if (provider.includes('edesa')) matchedProvince = 'salta';
  }

  if (matchedProvince) {
    provinceSel.value = matchedProvince;
    provinceSel.dispatchEvent(new Event('change'));
  }
}

// Convert PDF to a single JPEG image using pdf.js (dynamic import)
async function pdfToImage(file) {
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Render each page to canvas
  const canvases = [];
  const maxPages = Math.min(pdf.numPages, 5); // limit to 5 pages
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);
  }

  // Combine all pages into one tall image
  const totalHeight = canvases.reduce((h, c) => h + c.height, 0);
  const maxWidth = Math.max(...canvases.map(c => c.width));
  const combined = document.createElement('canvas');
  combined.width = maxWidth;
  combined.height = totalHeight;
  const ctx = combined.getContext('2d');
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }

  return combined.toDataURL('image/jpeg', 0.80);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// ---------- Run Calculation ----------
function runCalculation() {
  const provinceId = document.getElementById('province').value;
  if (!provinceId) { showToast('Selecciona una provincia', 'error'); return; }

  let monthlyKwh;
  let tariffId;

  if (entryMode === 'auto') {
    monthlyKwh = parseFloat(document.getElementById('auto-kwh').value);
    tariffId = document.getElementById('auto-tariff') ? document.getElementById('auto-tariff').value : '';

    if (!monthlyKwh || monthlyKwh < 10) {
      showToast('Primero subi una foto de tu factura para analizar', 'error');
      return;
    }
    if (!tariffId) {
      showToast('No se pudo detectar la tarifa de tu factura. Usa el modo manual.', 'error');
      return;
    }
  } else {
    tariffId = document.getElementById('tariff').value;
    if (!tariffId) { showToast('Selecciona un proveedor de energía', 'error'); return; }

    if (currentMode === 'kwh') {
      monthlyKwh = parseFloat(document.getElementById('input-kwh').value);
    } else {
      const amount = parseFloat(document.getElementById('input-money').value);
      if (!amount) { showToast('Ingresa el monto de tu factura', 'error'); return; }
      monthlyKwh = estimateKwhFromBill(amount, tariffId);
    }
  }

  if (!monthlyKwh || monthlyKwh < 10) {
    showToast('Ingresa un consumo valido (minimo 10 kWh)', 'error');
    return;
  }

  // Equipment overrides
  const panelSelVal = document.getElementById('panel-select')?.value;
  const invSelVal = document.getElementById('inverter-select')?.value;
  const numPanelsInput = parseInt(document.getElementById('num-panels-override')?.value) || 0;

  // Si hay factura, calcular precio real: (cargo_variable_1 + cargo_variable_2) / consumo_kwh
  let billPricePerKwh = null;
  if (currentBillData && currentBillData.consumo_kwh) {
    const cv1 = currentBillData.cargo_variable_1 || 0;
    const cv2 = currentBillData.cargo_variable_2 || 0;
    if (cv1 + cv2 > 0) {
      billPricePerKwh = (cv1 + cv2) / currentBillData.consumo_kwh;
    }
  }

  const calcParams = {
    provinceId, monthlyKwh, tariffId,
    systemType: currentSystemType,
    numPanelsOverride: numPanelsInput > 0 ? numPanelsInput : currentPanelOverride,
    autonomyHours: parseInt(document.getElementById('autonomy-hours').value),
    batteryType: document.getElementById('battery-type').value,
    criticalLoadWatts: parseInt(document.getElementById('critical-load-watts').value) || 3000,
    panelId: panelSelVal ? parseInt(panelSelVal) : null,
    inverterId: invSelVal ? parseInt(invSelVal) : null,
    phaseType: currentPhaseType,
    roofType: currentRoofType,
    maxPowerKw: currentMaxPowerKw,
    billPricePerKwh,
  };

  // Hide results and show loading animation
  document.getElementById('results').classList.remove('visible');
  document.getElementById('calc-btn').disabled = true;
  document.getElementById('calc-btn').textContent = 'Calculando...';

  runAnalysisAnimation(calcParams);
}

function runAnalysisAnimation(calcParams) {
  const loading = document.getElementById('calc-loading');
  const steps = [
    document.getElementById('as-1'),
    document.getElementById('as-2'),
    document.getElementById('as-3'),
    document.getElementById('as-4'),
  ];

  // Reset steps
  steps.forEach(s => { s.className = 'analysis-step'; s.querySelector('.as-icon').textContent = ''; });
  loading.style.display = 'block';
  loading.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const delays = [0, 600, 1200, 1800];
  const doneTimes = [500, 1100, 1700, 2300];

  // Activate each step sequentially
  delays.forEach((delay, i) => {
    setTimeout(() => {
      steps[i].classList.add('active');
    }, delay);
  });

  // Mark each step as done with checkmark
  doneTimes.forEach((time, i) => {
    setTimeout(() => {
      steps[i].classList.remove('active');
      steps[i].classList.add('done');
      steps[i].querySelector('.as-icon').textContent = '\u2713';
    }, time);
  });

  // After animation, run actual calculation — then show lead modal before results
  setTimeout(() => {
    const result = calculateSolar(calcParams);

    loading.style.display = 'none';
    document.getElementById('calc-btn').disabled = false;
    document.getElementById('calc-btn').textContent = 'Cotiza tu sistema';

    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    currentResult = result;
    if (!currentPanelOverride) currentPanelOverride = null;

    // Show lead modal only first time, then go straight to results
    if (leadSubmitted) {
      updateProgress(1, true);
      updateProgress(2, true);
      updateProgress(3, true);
      updateProgress(4, true);
      renderResults(currentResult);
    } else {
      showLeadModal();
    }
  }, 2600);
}

// ---------- Lead capture ----------
function showLeadModal() {
  const modal = document.getElementById('lead-modal');
  modal.style.display = 'flex';
  document.getElementById('lead-name').focus();
}

function hideLeadModal() {
  document.getElementById('lead-modal').style.display = 'none';
}

function submitLead() {
  const name = document.getElementById('lead-name').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const phone = document.getElementById('lead-phone').value.trim();

  if (!name) { showToast('Ingresa tu nombre', 'error'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Ingresa un email válido', 'error'); return; }

  // Mostrar resultados INMEDIATAMENTE
  leadSubmitted = true;
  hideLeadModal();
  incrementQuoteCounter();
  updateProgress(1, true);
  updateProgress(2, true);
  updateProgress(3, true);
  updateProgress(4, true);
  renderResults(currentResult);

  // Enviar lead en background (no bloquea UI)
  const r = currentResult;
  const budget = r ? {
    province: r.province,
    monthlyKwh: r.monthlyKwh,
    systemType: r.systemType,
    systemTypeLabel: r.systemTypeLabel,
    totalCostARS: r.totalCostARS,
    numPanels: r.numPanels,
    panelName: r.selectedPanel,
    inverterInfo: r.selectedInverters?.map(i => i.qty + 'x ' + i.name).join(', '),
    batteryCount: r.batteryCount || 0,
    structureInfo: r.structureDetail?.map(s => s.qty + 'x ' + s.name).join(', '),
    panelCostARS: r.panelCostARS,
    inverterCostARS: r.inverterCostARS,
    structureCostARS: r.structureCostARS,
    batteryCostARS: r.batteryCostARS,
    installCostARS: r.installCostARS,
    monthlySavingsARS: r.monthlySavingsARS,
    monthlyGenerationKwh: r.monthlyGenerationKwh,
    pricePerKwh: r.pricePerKwh,
    coveragePercent: r.coveragePercent,
    paybackYears: r.paybackYears,
    systemKwp: r.systemKwp,
    hsp: r.hsp,
  } : null;

  fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, budget, billImage: currentBillImage }),
  }).catch(err => console.warn('Lead API error:', err.message));
}


async function generatePDFBase64() {
  if (typeof window.jspdf === 'undefined') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (typeof window.jspdf === 'undefined') return null;
  }

  const r = currentResult;
  const cfg = getConfig();
  const date = new Date().toLocaleDateString('es-AR');
  const phone = cfg.whatsappNumber || '5491155881126';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const w = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  const addText = (text, x, _y, opts = {}) => {
    doc.setFontSize(opts.size || 10);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setTextColor(opts.color || '#222222');
    doc.text(text, x, _y, opts.align ? { align: opts.align } : undefined);
  };
  const addLine = (_y, color) => { doc.setDrawColor(color || '#dddddd'); doc.line(margin, _y, w - margin, _y); };
  const addRow = (label, value, _y) => { addText(label, margin, _y); addText(value, w - margin, _y, { align: 'right' }); return _y + 6; };
  const addSectionHeader = (title, _y) => { addText(title, margin, _y, { size: 12, bold: true, color: '#e68a00' }); return _y + 8; };
  const checkPage = (_y, needed) => { if (_y + needed > 275) { doc.addPage(); return 15; } return _y; };

  // Header
  addText('PRESUPUESTO SOLAR', margin, y, { size: 18, bold: true, color: '#e68a00' });
  addText('Navimaq Solar', w - margin, y, { size: 12, align: 'right', color: '#666666' });
  y += 6;
  addText('navimaqsolar.com.ar', w - margin, y, { size: 8, align: 'right', color: '#999999' });
  y += 4;
  addLine(y, '#e68a00');
  y += 6;
  addText('Fecha: ' + date, margin, y, { size: 9, color: '#666666' });
  addText('Sistema: ' + r.systemTypeLabel + '  |  ' + r.province + ' (' + r.hsp + ' HSP)', w - margin, y, { size: 9, align: 'right', color: '#666666' });
  y += 10;

  // Hero metrics
  doc.setFillColor(255, 248, 235);
  doc.roundedRect(margin, y - 4, w - margin * 2, 20, 3, 3, 'F');
  const heroX = [margin + 10, margin + 55, margin + 105, margin + 150];
  addText(formatNumber(r.systemKwp) + ' kWp', heroX[0], y + 4, { size: 14, bold: true, color: '#e68a00' });
  addText('Potencia', heroX[0], y + 10, { size: 7, color: '#888888' });
  addText(formatARS(r.monthlySavingsARS), heroX[1], y + 4, { size: 14, bold: true, color: '#e68a00' });
  addText('Ahorro/mes', heroX[1], y + 10, { size: 7, color: '#888888' });
  addText(r.paybackYears < 50 ? formatNumber(r.paybackYears) + ' años' : 'N/A', heroX[2], y + 4, { size: 14, bold: true, color: '#e68a00' });
  addText('Payback', heroX[2], y + 10, { size: 7, color: '#888888' });
  addText(Math.round(r.coveragePercent) + '%', heroX[3], y + 4, { size: 14, bold: true, color: '#e68a00' });
  addText('Cobertura', heroX[3], y + 10, { size: 7, color: '#888888' });
  y += 24;

  // Equipamiento
  y = addSectionHeader('Equipamiento recomendado', y);
  y = addRow(r.numPanels + 'x ' + r.selectedPanel + ' (' + r.panelWatts + 'W)', '', y);
  if (r.selectedInverters.length) {
    r.selectedInverters.forEach(inv => {
      y = addRow((inv.qty > 1 ? inv.qty + 'x ' : '') + inv.name, '', y);
    });
  }
  if (r.batteryCount > 0 && r.selectedBattery) {
    y = addRow(r.batteryCount + 'x ' + r.selectedBattery + ' (' + r.batteryTypeLabel + ')', '', y);
    y = addRow('Autonomía', r.autonomyHours + ' hs / ' + r.batteryKwh + ' kWh', y);
  }
  y += 4;

  // Inversion total
  y = checkPage(y, 20);
  doc.setFillColor(255, 248, 235);
  doc.roundedRect(margin, y - 4, w - margin * 2, 16, 3, 3, 'F');
  addText('INVERSION TOTAL', margin + 8, y + 4, { size: 12, bold: true });
  addText(formatARS(r.totalCostARS), w - margin - 8, y + 4, { size: 14, bold: true, color: '#e68a00', align: 'right' });
  addText('IVA incluido — Incluye equipamiento, estructura e instalación', margin + 8, y + 10, { size: 7, color: '#888888' });
  y += 22;

  // Ahorro mensual
  y = checkPage(y, 20);
  y = addSectionHeader('Ahorro estimado', y);
  y = addRow('Ahorro mensual', formatARS(r.monthlySavingsARS) + '/mes', y);
  y = addRow('Recupero inversión', r.paybackYears < 50 ? formatNumber(r.paybackYears) + ' años' : 'N/A', y);
  y += 4;

  // Ambiental
  y = checkPage(y, 20);
  y = addSectionHeader('Impacto ambiental', y);
  y = addRow('Generación anual', formatNumber(r.annualGenerationKwh) + ' kWh/año', y);
  y = addRow('CO2 evitado', formatNumber(r.annualCO2kg) + ' kg/año', y);
  y = addRow('Árboles equivalentes', r.treesEquivalent + ' árboles', y);
  y += 6;

  // Disclaimer
  y = checkPage(y, 30);
  addLine(y);
  y += 6;
  addText('Presupuesto Preliminar Estimativo', margin, y, { size: 9, bold: true });
  y += 5;
  addText('Los valores son orientativos y estan sujetos a modificaciones tras la visita tecnica.', margin, y, { size: 7, color: '#888888' });
  y += 4;
  addText('Garantía: 12 meses sobre la instalación. No incluye trámites medidor bidireccional.', margin, y, { size: 7, color: '#888888' });
  y += 8;

  // Footer
  addText('Navimaq Solar — navimaqsolar.com.ar', w / 2, y, { size: 9, bold: true, align: 'center', color: '#e68a00' });
  y += 5;
  addText('WhatsApp: +' + phone, w / 2, y, { size: 8, align: 'center', color: '#666666' });

  return doc.output('datauristring').split(',')[1];
}

// ---------- CountUp Animation (M3.2) ----------
function animateValue(el, endVal, duration, prefix, suffix) {
  prefix = prefix || '';
  suffix = suffix || '';
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (endVal - start) * eased;

    if (typeof endVal === 'number' && endVal >= 1000) {
      el.textContent = prefix + formatNumber(Math.round(current)) + suffix;
    } else if (typeof endVal === 'number') {
      el.textContent = prefix + current.toFixed(1) + suffix;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function animateARS(el, endVal, duration) {
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = endVal * eased;
    el.textContent = formatARS(Math.round(current));
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ---------- Render Results ----------
function renderResults(r) {
  const el = id => document.getElementById(id);

  // System type
  el('r-system-type').textContent = r.systemTypeLabel;

  // Off-grid warning
  const warningEl = el('r-offgrid-warning');
  if (r.offgridWarning) {
    warningEl.textContent = r.offgridWarning;
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }

  // Power limit warning
  if (r.powerLimitWarning) {
    const warnDiv = document.createElement('div');
    warnDiv.className = 'offgrid-warning';
    warnDiv.textContent = r.powerLimitWarning;
    el('r-offgrid-warning').parentNode.insertBefore(warnDiv, el('r-offgrid-warning').nextSibling);
  }

  // Hero metrics strip — with countUp animation
  animateValue(el('r-power'), r.systemKwp, 800, '', '');
  animateARS(el('r-save-month-hero'), r.monthlySavingsARS, 800);
  if (el('r-payback-hero')) el('r-payback-hero').textContent = r.paybackYears >= 50 ? 'N/A' : formatNumber(r.paybackYears) + ' años';
  el('r-coverage').textContent = '0%';
  animateValue(el('r-coverage'), Math.round(r.coveragePercent), 800, '', '%');

  // Panel adjuster
  el('r-panels').textContent = r.numPanels;
  el('r-panel-rec').textContent = r.numPanels === r.recommendedPanels ? '(recomendado)' : '(recomendado: ' + r.recommendedPanels + ')';

  // Ahorro P x Q (generación x costo variable)
  const pxqSavings = Math.round(r.monthlyGenerationKwh) * r.pricePerKwh;
  el('r-gen-month-kwh').textContent = formatNumber(Math.round(r.monthlyGenerationKwh));
  el('r-cost-kwh').textContent = formatARS(r.pricePerKwh);
  // Indicar si el precio viene de la factura real
  const costKwhSub = document.querySelector('#r-cost-kwh')?.closest('.bill-box')?.querySelector('.bill-sub');
  if (costKwhSub) costKwhSub.textContent = currentBillData?.cargo_variable_1 ? '$/kWh (de tu factura)' : '$/kWh (tarifa ref.)';
  el('r-pxq-savings').textContent = formatARS(pxqSavings);

  // Cost breakdown
  el('r-panel-detail').textContent = r.numPanels + 'x ' + r.selectedPanel;
  el('r-cost-panels').textContent = formatARS(r.panelCostARS);

  const invDetail = r.selectedInverters.map(i => (i.qty > 1 ? i.qty + 'x ' : '') + i.name).join(', ');
  el('r-inverter-detail').textContent = invDetail || 'No seleccionado';
  el('r-cost-inverter').textContent = formatARS(r.inverterCostARS);

  // Battery costs
  const battRow = el('r-battery-cost-row');
  if (r.systemType !== 'ongrid' && r.batteryCount > 0) {
    battRow.style.display = 'flex';
    el('r-battery-detail').textContent = r.batteryCount + 'x ' + (r.selectedBattery || 'Bateria') + ' (' + r.batteryTypeLabel + ')';
    el('r-cost-battery').textContent = formatARS(r.batteryCostARS);
  } else {
    battRow.style.display = 'none';
  }

  el('r-cost-structure').textContent = formatARS(r.structureCostARS);
  el('r-cost-install').textContent = formatARS(r.installCostARS);
  el('r-cost-total').textContent = formatARS(r.totalCostARS);

  // Savings — usar mismo P×Q que la sección de arriba
  el('r-save-month').textContent = formatARS(pxqSavings);
  // Ahorro anual: sumar generación mes a mes × precio kWh
  const pxqAnnual = r.monthlyGeneration.reduce((sum, m) => sum + m.kwh * r.pricePerKwh, 0);
  el('r-save-year').textContent = formatARS(pxqAnnual);
  el('r-payback').textContent = r.paybackYears >= 50 ? 'N/A' : formatNumber(r.paybackYears) + ' años';

  // Métricas financieras (Colo)
  if (el('r-van')) el('r-van').textContent = formatARS(r.van);
  if (el('r-tir')) el('r-tir').textContent = (r.tir * 100).toFixed(1) + '%';
  if (el('r-lcoe')) el('r-lcoe').textContent = '$' + formatNumber(r.lcoe) + '/kWh';
  if (el('r-autoconsumo')) el('r-autoconsumo').textContent = Math.round(r.selfConsumptionQuota * 100) + '%';

  // Battery card
  const battCard = el('r-battery-card');
  if (r.systemType !== 'ongrid' && r.batteryKwh > 0) {
    battCard.style.display = 'block';
    el('r-battery-kwh').textContent = r.batteryKwh;
    el('r-battery-count').textContent = r.batteryCount;
  } else {
    battCard.style.display = 'none';
  }

  // Environmental
  el('r-co2').textContent = formatNumber(r.annualCO2kg);
  el('r-trees').textContent = r.treesEquivalent;
  el('r-gen-kwh').textContent = formatNumber(r.annualGenerationKwh);
  el('r-area').textContent = formatNumber(r.areaM2);

  // Projection info
  const cfg = getConfig();
  el('r-degradation').textContent = ((cfg.panelDegradation || 0.005) * 100).toFixed(1);
  el('r-inflation').textContent = Math.round((cfg.tariffInflation || 0) * 100);

  // Equipment list — sin precios unitarios, tipografía uniforme
  let equipHtml = '<div class="cost-row"><span><strong>' + esc(r.numPanels + 'x') + '</strong> ' + esc(r.selectedPanel) + ' — ' + r.panelWatts + 'W c/u</span></div>';
  if (r.selectedInverters.length > 0) {
    r.selectedInverters.forEach(inv => {
      equipHtml += '<div class="cost-row"><span><strong>' + esc((inv.qty > 1 ? inv.qty + 'x ' : '')) + '</strong>' + esc(inv.name) + ' — ' + (inv.watts / 1000) + ' kW</span></div>';
    });
  } else {
    equipHtml += '<div class="cost-row"><span>Inversor — Consultar dimensionamiento especial</span></div>';
  }
  if (r.batteryCount > 0 && r.selectedBattery) {
    equipHtml += '<div class="cost-row"><span><strong>' + esc(r.batteryCount + 'x') + '</strong> ' + esc(r.selectedBattery) + ' — ' + r.batteryKwh + ' kWh</span></div>';
  }
  if (r.structureDetail && r.structureDetail.length > 0) {
    r.structureDetail.forEach(s => {
      equipHtml += '<div class="cost-row"><span><strong>' + esc(s.qty + 'x') + '</strong> ' + esc(s.name) + '</span></div>';
    });
  }
  equipHtml += '<div class="cost-row"><span>Protecciones AC/DC</span></div>';
  equipHtml += '<div class="cost-row"><span>Instalación y puesta en marcha</span></div>';
  equipHtml += '<div style="margin-top:1rem; padding-top:1rem; border-top:2px solid var(--accent); text-align:center;">'
    + '<div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:0.3rem;">Inversión estimada</div>'
    + '<div style="font-size:1.8rem; font-weight:800; color:var(--accent);">' + formatARS(r.totalCostARS) + '</div>'
    + '<div style="font-size:0.75rem; color:var(--text-muted);">IVA incluido</div>'
    + '</div>';
  el('r-equipment-list').innerHTML = equipHtml;

  // Proposal section (M2.1)
  renderProposal(r);

  // Financing section (M2.2)
  renderFinancing(r);

  // Comparison section (M2.3) — show button
  el('comparison-section').style.display = 'block';
  el('comparison-content').style.display = 'none';

  // Show results
  const resultsEl = document.getElementById('results');
  resultsEl.classList.add('visible');
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Show WhatsApp float
  document.getElementById('whatsapp-float').style.display = 'flex';

  // Render charts (delayed to ensure DOM is visible)
  setTimeout(() => {
    if (typeof Chart !== 'undefined') {
      renderMonthlyChart('chart-monthly', r.monthlyGeneration, r.monthlyKwh);
      renderCostDonut('chart-costs', r);
    }
  }, 100);
}

// ---------- Proposal Section (M2.1) ----------
function renderProposal(r) {
  const section = document.getElementById('proposal-section');
  const summary = document.getElementById('proposal-summary');
  section.style.display = 'block';

  const coverText = r.coveragePercent >= 100 ? 'cubriendo el 100% de tu consumo' : 'cubriendo el ' + Math.round(r.coveragePercent) + '% de tu consumo';
  const battText = r.systemType !== 'ongrid' ? ' Con almacenamiento de ' + r.batteryKwh + ' kWh en baterías ' + r.batteryTypeLabel + ' para ' + r.autonomyHours + ' horas de autonomía (' + r.criticalLoadWatts + 'W cargas críticas).' : '';

  summary.innerHTML = 'Para tu hogar en <strong>' + esc(r.province) + '</strong> (' + r.hsp + ' HSP), recomendamos un sistema <strong>' + esc(r.systemTypeLabel) + '</strong> de <strong>' + formatNumber(r.systemKwp) + ' kWp</strong> con ' + r.numPanels + ' paneles ' + esc(r.selectedPanel) + ', ' + coverText + '.'
    + battText;
}

// ---------- Financing Section (M2.2) ----------
function renderFinancing(r) {
  const section = document.getElementById('financing-section');
  const grid = document.getElementById('financing-grid');
  section.style.display = 'block';

  const cfg = getConfig();
  const products = getProducts();

  // Calculate cash price (with cash discount applied — already in totalCostARS)
  const cashTotal = r.totalCostARS;

  // Flex price (without cash discount): recalculate
  // The cashDiscount is applied per product. To get flex price, we need to reverse it.
  // Simpler approach: recalculate total using flexPriceUSD or without cashDiscount
  let flexTotal = 0;
  const panel = products.find(p => p.name === r.selectedPanel) || products.find(p => p.category === 'panel');
  if (panel) {
    const panelFlex = panel.priceARS || ((panel.flexPriceUSD || panel.priceUSD) * cfg.margin * cfg.dollarRate * (1 + panel.iva));
    flexTotal += r.numPanels * panelFlex;
  } else {
    flexTotal += r.panelCostARS / (1 - 0.15); // approximate
  }

  // Inverter flex
  r.selectedInverters.forEach(inv => {
    const invProd = products.find(p => p.name === inv.name);
    if (invProd) {
      const invFlex = invProd.priceARS || ((invProd.flexPriceUSD || invProd.priceUSD) * cfg.margin * cfg.dollarRate * (1 + invProd.iva));
      flexTotal += inv.qty * invFlex;
    } else {
      flexTotal += inv.priceARS / (1 - 0.15);
    }
  });

  flexTotal += r.structureCostARS / (1 - 0.15);
  if (r.batteryCostARS > 0) flexTotal += r.batteryCostARS / (1 - 0.15);
  flexTotal += r.installCostARS;

  // Cuotas config
  const cuotasOptions = [3, 6, 12];
  const tasaMensual = 0.05; // 5% mensual

  const savingsPct = cashTotal < flexTotal ? Math.round((1 - cashTotal / flexTotal) * 100) : 0;

  let html = '';

  // Contado
  html += '<div class="financing-card recommended">'
    + '<h4>Contado</h4>'
    + '<div class="fin-price" style="color:var(--success);">' + formatARS(cashTotal) + '</div>'
    + '<div class="fin-detail">Transferencia o efectivo</div>'
    + (savingsPct > 0 ? '<div class="fin-savings">Ahorras ' + savingsPct + '% vs precio lista</div>' : '')
    + '</div>';

  // Flex / precio lista
  html += '<div class="financing-card">'
    + '<h4>Precio lista</h4>'
    + '<div class="fin-price" style="color:var(--gold);">' + formatARS(Math.round(flexTotal)) + '</div>'
    + '<div class="fin-detail">Sin descuento contado</div>'
    + '</div>';

  // Cuotas (6 cuotas como ejemplo principal)
  const cuotas6 = 6;
  const cuotaAmount = flexTotal * (tasaMensual * Math.pow(1 + tasaMensual, cuotas6)) / (Math.pow(1 + tasaMensual, cuotas6) - 1);
  html += '<div class="financing-card">'
    + '<h4>' + cuotas6 + ' cuotas</h4>'
    + '<div class="fin-price" style="color:var(--text);">' + formatARS(Math.round(cuotaAmount)) + '<span style="font-size:0.7rem;color:var(--text-muted)">/mes</span></div>'
    + '<div class="fin-detail">Total: ' + formatARS(Math.round(cuotaAmount * cuotas6)) + '</div>'
    + '<div class="fin-detail" style="margin-top:0.3rem;">Tambien en 3 o 12 cuotas</div>'
    + '</div>';

  grid.innerHTML = html;
}

// ---------- System Comparison (M2.3) ----------
function toggleComparison() {
  const content = document.getElementById('comparison-content');
  const btn = document.getElementById('btn-compare');
  if (content.style.display === 'none') {
    renderComparison();
    content.style.display = 'block';
    btn.textContent = 'Ocultar comparacion';
  } else {
    content.style.display = 'none';
    btn.textContent = 'Comparar On-Grid vs Hibrido vs Off-Grid';
  }
}

function renderComparison() {
  if (!currentResult) return;

  const provinceId = document.getElementById('province').value;
  const tariffId = document.getElementById('tariff').value || (document.getElementById('auto-tariff') ? document.getElementById('auto-tariff').value : '');
  const monthlyKwh = currentResult.monthlyKwh;

  if (!tariffId) return;

  const types = ['ongrid', 'hybrid', 'offgrid'];
  const labels = ['On-Grid', 'Hibrido', 'Off-Grid'];
  const results = {};

  types.forEach(type => {
    results[type] = calculateSolar({
      provinceId, monthlyKwh, tariffId,
      systemType: type,
      autonomyHours: 24,
      batteryType: 'litio',
      criticalLoadWatts: 3000,
    });
  });

  const table = document.getElementById('comparison-table');
  const activeType = currentSystemType;

  const metrics = [
    { label: 'Potencia', key: r => formatNumber(r.systemKwp) + ' kWp' },
    { label: 'Paneles', key: r => r.numPanels },
    { label: 'Inversion total', key: r => formatARS(r.totalCostARS), best: 'min', numKey: r => r.totalCostARS },
    { label: 'Ahorro mensual', key: r => formatARS(r.monthlySavingsARS), best: 'max', numKey: r => r.monthlySavingsARS },
    { label: 'Payback', key: r => r.paybackYears < 50 ? formatNumber(r.paybackYears) + ' años' : 'N/A', best: 'min', numKey: r => r.paybackYears },
    { label: 'Cobertura', key: r => Math.round(r.coveragePercent) + '%', best: 'max', numKey: r => r.coveragePercent },
    { label: 'ROI ' + (getConfig().projectLifeYears || 20) + ' años', key: r => Math.round(r.roi25years) + '%', best: 'max', numKey: r => r.roi25years },
    { label: 'Autonomía', key: r => r.systemType === 'ongrid' ? 'No (conectado a red)' : r.autonomyHours + ' hs' },
    { label: 'Baterias', key: r => r.batteryCount > 0 ? r.batteryCount + 'x ' + (r.selectedBattery || '') : 'No requiere' },
    { label: 'CO2 evitado', key: r => formatNumber(r.annualCO2kg) + ' kg/año' },
  ];

  let html = '<thead><tr><th></th>';
  types.forEach((t, i) => {
    html += '<th class="' + (t === activeType ? 'active-col' : '') + '">' + labels[i] + (t === activeType ? ' (actual)' : '') + '</th>';
  });
  html += '</tr></thead><tbody>';

  metrics.forEach(m => {
    html += '<tr><td>' + m.label + '</td>';

    let bestIdx = -1;
    if (m.best && m.numKey) {
      const vals = types.map(t => results[t].error ? (m.best === 'min' ? Infinity : -Infinity) : m.numKey(results[t]));
      if (m.best === 'min') bestIdx = vals.indexOf(Math.min(...vals));
      else bestIdx = vals.indexOf(Math.max(...vals));
    }

    types.forEach((t, i) => {
      const r = results[t];
      const val = r.error ? 'N/A' : m.key(r);
      html += '<td class="' + (i === bestIdx ? 'best' : '') + '">' + val + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody>';
  table.innerHTML = html;
}

// ---------- WhatsApp ----------
function sendWhatsApp() {
  const cfg = getConfig();
  const phone = cfg.whatsappNumber || '5491155881126';
  let msg = 'Hola! ';

  if (currentResult) {
    const r = currentResult;
    msg += 'Calcule un sistema solar de ' + formatNumber(r.systemKwp) + ' kWp';
    msg += ' (' + r.systemTypeLabel + ')';
    msg += ' para mi casa en ' + r.province + '.';
    msg += ' Consumo: ' + formatNumber(r.monthlyKwh) + ' kWh/mes.';
    msg += ' Me interesa un presupuesto.';
  } else {
    msg += 'Me interesa un presupuesto de energía solar.';
  }

  window.open('https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent(msg), '_blank');
}

function consultProduct(productName) {
  const cfg = getConfig();
  const phone = cfg.whatsappNumber || '5491155881126';
  const msg = 'Hola! Me interesa consultar por: ' + productName;
  window.open('https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent(msg), '_blank');
}

// ---------- Category Labels ----------
const CATEGORY_LABELS = {
  'panel': 'Panel Solar',
  'bateria': 'Bateria',
  'inversor': 'Inversor On-Grid',
  'inversor-offgrid': 'Inversor Off-Grid',
  'inversor-hibrido': 'Inversor Hibrido',
  'monitoring': 'Monitoreo / Iny. Cero',
  'wifi': 'Modulo WiFi',
  'proteccion': 'Proteccion',
  'estructura': 'Estructura',
  'termotanque': 'Termotanque Solar',
  'powermeter': 'Powermeter',
};

const CATEGORY_ORDER = ['panel','inversor','inversor-offgrid','inversor-hibrido','bateria','estructura','proteccion','monitoring','wifi','termotanque','powermeter'];

// ---------- Products ----------
let activeFilter = 'all';
let searchQuery = '';
let sortMode = 'default';

function searchProducts(query) {
  searchQuery = query.toLowerCase();
  renderProducts();
}

function sortProducts(mode) {
  sortMode = mode;
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  const products = getProducts();

  // Build filter buttons
  let filterContainer = document.getElementById('product-filters');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'product-filters';
    filterContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.5rem;';
    grid.parentNode.insertBefore(filterContainer, grid);
  }

  const categories = [...new Set(products.map(p => p.category))];
  const sortedCats = categories.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  filterContainer.innerHTML = `<button class="btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="filterProducts('all')">Todos (${products.length})</button>`;
  sortedCats.forEach(cat => {
    const count = products.filter(p => p.category === cat).length;
    const label = CATEGORY_LABELS[cat] || cat;
    filterContainer.innerHTML += `<button class="btn btn-sm ${activeFilter === cat ? 'btn-primary' : 'btn-secondary'}" onclick="filterProducts('${cat}')">${label} (${count})</button>`;
  });

  // Filter
  let filtered = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);

  // Search
  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchQuery) ||
      p.description.toLowerCase().includes(searchQuery) ||
      (p.brand && p.brand.toLowerCase().includes(searchQuery))
    );
  }

  // Sort
  if (sortMode === 'price-asc') {
    filtered.sort((a, b) => calcFinalPriceARS(a) - calcFinalPriceARS(b));
  } else if (sortMode === 'price-desc') {
    filtered.sort((a, b) => calcFinalPriceARS(b) - calcFinalPriceARS(a));
  }

  grid.innerHTML = '';

  filtered.forEach(p => {
    const priceARS = calcFinalPriceARS(p);
    const usd = p.flexPriceUSD || p.priceUSD;
    const label = CATEGORY_LABELS[p.category] || p.category;
    const ivaLine = p.priceARS ? 'IVA incluido' : formatUSD(usd) + ' + IVA ' + (p.iva * 100).toFixed(1) + '%';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <span class="category-tag">${label}</span>
      <h3>${esc(p.name)}</h3>
      <p class="desc">${esc(p.description)}</p>
      <div class="price">${formatARS(priceARS)}</div>
      <div class="price-usd">${ivaLine}</div>
      <button class="btn-consult" onclick="consultProduct('${esc(p.name).replace(/'/g, "\\'")}')">Consultar</button>
    `;
    grid.appendChild(card);
  });
}

function filterProducts(cat) {
  activeFilter = cat;
  renderProducts();
}

// ---------- PDF Export (M1.3) — html2canvas + jsPDF ----------
async function exportPDF() {
  if (!currentResult) return;
  const r = currentResult;
  const cfg = getConfig();
  const date = new Date().toLocaleDateString('es-AR');
  const phone = cfg.whatsappNumber || '5491155881126';

  // Check if jsPDF is loaded
  if (typeof window.jspdf === 'undefined') {
    showToast('Cargando generador de PDF...', 'info');
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (typeof window.jspdf === 'undefined') {
      showToast('Error al cargar el generador de PDF. Intenta de nuevo.', 'error');
      return;
    }
  }

  showToast('Generando PDF...', 'info');

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 15;

    // Helper functions
    const addText = (text, x, _y, opts = {}) => {
      doc.setFontSize(opts.size || 10);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setTextColor(opts.color || '#222222');
      doc.text(text, x, _y, opts.align ? { align: opts.align } : undefined);
    };

    const addLine = (_y, color) => {
      doc.setDrawColor(color || '#dddddd');
      doc.line(margin, _y, w - margin, _y);
    };

    const addRow = (label, value, _y) => {
      addText(label, margin, _y);
      addText(value, w - margin, _y, { align: 'right' });
      return _y + 6;
    };

    const addSectionHeader = (title, _y) => {
      addText(title, margin, _y, { size: 12, bold: true, color: '#00875a' });
      return _y + 8;
    };

    const checkPage = (_y, needed) => {
      if (_y + needed > 275) {
        doc.addPage();
        return 15;
      }
      return _y;
    };

    // --- HEADER ---
    addText('PRESUPUESTO SOLAR', margin, y, { size: 18, bold: true, color: '#00875a' });
    addText('Navimaq Solar', w - margin, y, { size: 12, align: 'right', color: '#666666' });
    y += 6;
    addText('navimaqsolar.com.ar', w - margin, y, { size: 8, align: 'right', color: '#999999' });
    y += 4;
    addLine(y, '#00875a');
    y += 6;

    // Metadata
    addText('Fecha: ' + date, margin, y, { size: 9, color: '#666666' });
    addText('Sistema: ' + r.systemTypeLabel + '  |  ' + r.province + ' (' + r.hsp + ' HSP)', w - margin, y, { size: 9, align: 'right', color: '#666666' });
    y += 10;

    // --- HERO METRICS ---
    doc.setFillColor(240, 250, 246);
    doc.roundedRect(margin, y - 4, w - margin * 2, 20, 3, 3, 'F');
    const heroX = [margin + 10, margin + 55, margin + 105, margin + 150];
    addText(formatNumber(r.systemKwp) + ' kWp', heroX[0], y + 4, { size: 14, bold: true, color: '#00875a' });
    addText('Potencia', heroX[0], y + 10, { size: 7, color: '#888888' });
    addText(formatARS(r.monthlySavingsARS), heroX[1], y + 4, { size: 14, bold: true, color: '#00875a' });
    addText('Ahorro/mes', heroX[1], y + 10, { size: 7, color: '#888888' });
    addText(r.paybackYears < 50 ? formatNumber(r.paybackYears) + ' años' : 'N/A', heroX[2], y + 4, { size: 14, bold: true, color: '#00875a' });
    addText('Payback', heroX[2], y + 10, { size: 7, color: '#888888' });
    addText(Math.round(r.coveragePercent) + '%', heroX[3], y + 4, { size: 14, bold: true, color: '#00875a' });
    addText('Cobertura', heroX[3], y + 10, { size: 7, color: '#888888' });
    y += 24;

    // --- EQUIPAMIENTO ---
    y = addSectionHeader('Equipamiento recomendado', y);
    y = addRow(r.numPanels + 'x ' + r.selectedPanel + ' (' + r.panelWatts + 'W)', formatARS(r.panelCostARS), y);
    if (r.selectedInverters.length) {
      r.selectedInverters.forEach(inv => {
        y = addRow((inv.qty > 1 ? inv.qty + 'x ' : '') + inv.name, formatARS(inv.priceARS || 0), y);
      });
    }
    if (r.batteryCount > 0 && r.selectedBattery) {
      y = addRow(r.batteryCount + 'x ' + r.selectedBattery + ' (' + r.batteryTypeLabel + ')', formatARS(r.batteryCostARS), y);
      y = addRow('Autonomía', r.autonomyHours + ' hs / ' + r.batteryKwh + ' kWh / ' + r.criticalLoadWatts + 'W críticos', y);
    }
    y = addRow('Cobertura del consumo', Math.round(r.coveragePercent) + '%', y);
    y = addRow('Superficie requerida', formatNumber(r.areaM2) + ' m2', y);
    y += 4;

    // --- COSTOS ---
    y = checkPage(y, 50);
    y = addSectionHeader('Desglose de costos', y);
    y = addRow('Paneles (' + r.numPanels + 'x)', formatARS(r.panelCostARS), y);
    y = addRow('Inversor', formatARS(r.inverterCostARS), y);
    if (r.batteryCostARS > 0) y = addRow('Baterias', formatARS(r.batteryCostARS), y);
    y = addRow('Estructura', formatARS(r.structureCostARS), y);
    y = addRow('Instalación', formatARS(r.installCostARS), y);
    addLine(y - 2, '#00875a');
    y += 2;
    addText('INVERSION TOTAL', margin, y, { size: 12, bold: true });
    addText(formatARS(r.totalCostARS), w - margin, y, { size: 12, bold: true, color: '#00875a', align: 'right' });
    y += 10;

    // --- AHORRO ESTIMADO ---
    y = checkPage(y, 20);
    y = addSectionHeader('Ahorro estimado', y);
    y = addRow('Ahorro mensual', formatARS(r.monthlySavingsARS) + '/mes', y);
    y = addRow('Recupero inversión', r.paybackYears < 50 ? formatNumber(r.paybackYears) + ' años' : 'N/A', y);
    y += 4;

    // --- AMBIENTAL ---
    y = checkPage(y, 20);
    y = addSectionHeader('Impacto ambiental', y);
    y = addRow('Generación anual', formatNumber(r.annualGenerationKwh) + ' kWh/año', y);
    y = addRow('CO2 evitado', formatNumber(r.annualCO2kg) + ' kg/año', y);
    y = addRow('Árboles equivalentes', r.treesEquivalent + ' árboles', y);
    y += 6;

    // --- FOOTER ---
    y = checkPage(y, 20);
    addLine(y, '#dddddd');
    y += 6;
    addText('Navimaq Solar — navimaqsolar.com.ar', w / 2, y, { size: 9, bold: true, align: 'center', color: '#00875a' });
    y += 5;
    addText('WhatsApp: +' + phone, w / 2, y, { size: 8, align: 'center', color: '#666666' });
    y += 5;
    addText('Precios al tipo de cambio del dia. Valores estimativos sujetos a confirmación.', w / 2, y, { size: 7, align: 'center', color: '#999999' });
    y += 4;
    addText('Consumo: ' + formatNumber(r.monthlyKwh) + ' kWh/mes — Tarifa: ' + r.tariffLabel, w / 2, y, { size: 7, align: 'center', color: '#999999' });

    // Save
    const filename = 'Presupuesto-Solar-Navimaq-' + r.systemTypeLabel + '-' + r.systemKwp.toFixed(1) + 'kWp.pdf';
    doc.save(filename);
    showToast('PDF descargado: ' + filename, 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Error al generar PDF. Intenta de nuevo.', 'error');
  }
}

// ---------- Analytics counters (M4.2) ----------
function incrementVisitCounter() {
  const key = 'solarnav_visits';
  const count = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(count));
}

function incrementQuoteCounter() {
  const key = 'solarnav_quotes';
  const count = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(count));
}
