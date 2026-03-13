// ============================================================
// SOLAR NAV - App Controller
// UI interactions, rendering, Ollama integration
// ============================================================

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  populateProvinces();
  populateTariffs();
  renderProducts();
  setupUpload();
  checkAI();
});

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

// ---------- Entry mode (auto/manual) ----------
let entryMode = 'auto';
let currentMode = 'kwh';
let currentSystemType = 'ongrid';
let currentResult = null;
let currentPanelOverride = null;

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
  const essGroup = document.getElementById('essential-load-group');
  battOpts.style.display = type === 'ongrid' ? 'none' : 'block';
  essGroup.style.display = type === 'hybrid' ? 'block' : 'none';

  // Set default autonomy days
  const slider = document.getElementById('autonomy-days');
  if (type === 'offgrid') { slider.value = 3; }
  else if (type === 'hybrid') { slider.value = 2; }
  document.getElementById('autonomy-val').textContent = slider.value;
}

// ---------- Panel adjuster ----------
function adjustPanels(delta) {
  if (!currentResult) return;
  const newCount = Math.max(1, currentResult.numPanels + delta);
  currentPanelOverride = newCount;
  runCalculation();
}

// ---------- AI integration (server-side proxy) ----------
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

async function processFile(file) {
  const area = document.getElementById('upload-area');
  area.innerHTML = '<div class="upload-icon">&#9203;</div><p>Analizando factura con IA...</p><p style="font-size:0.8rem; color:var(--text-muted);">Unos segundos...</p>';

  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    const b64data = base64.split(',')[1];

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64data, mimeType }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al analizar');
    }

    showBillResult(data.result);
    autoFillFromBill(data.result);
  } catch (err) {
    area.innerHTML = '<div class="upload-icon">&#10060;</div><p>Error al analizar: ' + esc(err.message) + '</p><p>Intenta con input manual</p>';
  }
}

// Escape HTML entities to prevent XSS
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
  if (data.dias_periodo) html += row('Dias periodo', data.dias_periodo + ' dias');
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
  // 1. Auto-fill kWh (both hidden auto field and manual input)
  if (data.consumo_kwh) {
    const kwh = Math.round(data.consumo_kwh);
    document.getElementById('auto-kwh').value = kwh;
    document.getElementById('input-kwh').value = kwh;
  }

  // 2. Match tariff based on proveedor + tipo_tarifa + actividad
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

  // Store in hidden field for auto mode
  let autoTariff = document.getElementById('auto-tariff');
  if (!autoTariff) {
    autoTariff = document.createElement('input');
    autoTariff.type = 'hidden';
    autoTariff.id = 'auto-tariff';
    document.getElementById('entry-auto').appendChild(autoTariff);
  }
  autoTariff.value = bestMatch;

  // Also set manual tariff dropdown
  if (bestMatch) {
    document.getElementById('tariff').value = bestMatch;
  }

  // 3. Show detected tariff in bill result
  if (bestMatch) {
    const matchedTariff = TARIFFS.find(t => t.id === bestMatch);
    if (matchedTariff) {
      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = 'margin-top:0.8rem; padding:0.6rem 1rem; background:var(--accent-glow); border-radius:8px; font-size:0.9rem; color:var(--accent);';
      infoDiv.innerHTML = '<strong>Tarifa detectada:</strong> ' + matchedTariff.name;
      document.getElementById('bill-extracted').appendChild(infoDiv);
    }
  }

  // 4. Auto-select province from bill address/province field
  const provinceSel = document.getElementById('province');
  const billProvincia = (data.provincia || '').toLowerCase();
  const billLocalidad = (data.localidad || '').toLowerCase();
  const billDireccion = (data.direccion || '').toLowerCase();
  const locationText = billProvincia + ' ' + billLocalidad + ' ' + billDireccion;

  let matchedProvince = '';

  // Try exact match from PROVINCES list
  for (const p of PROVINCES) {
    const pName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const locNorm = locationText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (locNorm.includes(pName) || locNorm.includes(p.id)) {
      matchedProvince = p.id;
      break;
    }
  }

  // Fallback: infer from provider
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
  if (!provinceId) { alert('Selecciona una provincia'); return; }

  let monthlyKwh;
  let tariffId;

  if (entryMode === 'auto') {
    // Auto mode: data comes from bill analysis
    monthlyKwh = parseFloat(document.getElementById('auto-kwh').value);
    tariffId = document.getElementById('auto-tariff') ? document.getElementById('auto-tariff').value : '';

    if (!monthlyKwh || monthlyKwh < 10) {
      alert('Primero subi una foto de tu factura para analizar');
      return;
    }
    if (!tariffId) {
      alert('No se pudo detectar la tarifa de tu factura. Usa el modo manual.');
      return;
    }
  } else {
    // Manual mode
    tariffId = document.getElementById('tariff').value;
    if (!tariffId) { alert('Selecciona un proveedor de energia'); return; }

    if (currentMode === 'kwh') {
      monthlyKwh = parseFloat(document.getElementById('input-kwh').value);
    } else {
      const amount = parseFloat(document.getElementById('input-money').value);
      if (!amount) { alert('Ingresa el monto de tu factura'); return; }
      monthlyKwh = estimateKwhFromBill(amount, tariffId);
    }
  }

  if (!monthlyKwh || monthlyKwh < 10) {
    alert('Ingresa un consumo valido');
    return;
  }

  const result = calculateSolar({
    provinceId, monthlyKwh, tariffId,
    systemType: currentSystemType,
    numPanelsOverride: currentPanelOverride,
    autonomyDays: parseInt(document.getElementById('autonomy-days').value),
    batteryType: document.getElementById('battery-type').value,
    essentialLoadPct: parseInt(document.getElementById('essential-load').value),
  });

  if (result.error) {
    alert(result.error);
    return;
  }

  currentResult = result;
  if (!currentPanelOverride) currentPanelOverride = null;
  renderResults(result);
}

// ---------- Render Results ----------
function renderResults(r) {
  const el = id => document.getElementById(id);

  // System type
  el('r-system-type').textContent = r.systemTypeLabel;

  // Panel adjuster
  el('r-panels').textContent = r.numPanels;
  el('r-panel-rec').textContent = r.numPanels === r.recommendedPanels ? '(recomendado)' : '(recomendado: ' + r.recommendedPanels + ')';

  // Key metrics
  el('r-power').textContent = formatNumber(r.systemKwp);
  el('r-area').textContent = formatNumber(r.areaM2);
  el('r-coverage').textContent = Math.round(r.coveragePercent) + '%';

  // Battery card
  const battCard = el('r-battery-card');
  if (r.systemType !== 'ongrid' && r.batteryKwh > 0) {
    battCard.style.display = 'block';
    el('r-battery-kwh').textContent = r.batteryKwh;
  } else {
    battCard.style.display = 'none';
  }

  // Bill comparison
  el('r-bill-before').textContent = formatARS(r.monthlyBillBefore);
  el('r-bill-after').textContent = formatARS(r.monthlyBillAfter);
  el('r-bill-pct').textContent = Math.round(r.billReductionPct) + '%';
  el('r-bill-save-ars').textContent = formatARS(r.monthlySavingsARS) + '/mes';

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

  // Savings
  el('r-save-month').textContent = formatARS(r.monthlySavingsARS);
  el('r-save-year').textContent = formatARS(r.annualSavingsARS);
  el('r-payback').textContent = r.paybackYears >= 50 ? 'N/A' : formatNumber(r.paybackYears) + ' años';
  el('r-roi').textContent = Math.round(r.roi25years) + '%';

  // Generation bar
  const pct = Math.min(100, r.coveragePercent);
  el('r-gen-bar').style.width = pct + '%';
  el('r-gen-bar').textContent = Math.round(pct) + '%';
  el('r-gen-label').textContent = formatNumber(r.monthlyGenerationKwh) + ' / ' + formatNumber(r.monthlyKwh) + ' kWh/mes';

  // Environmental
  el('r-co2').textContent = formatNumber(r.annualCO2kg);
  el('r-trees').textContent = r.treesEquivalent;
  el('r-gen-kwh').textContent = formatNumber(r.annualGenerationKwh);

  // Equipment list
  let equipHtml = '<div class="cost-row"><span><strong>' + esc(r.numPanels + 'x') + '</strong> ' + esc(r.selectedPanel) + '</span><span>' + r.panelWatts + 'W c/u — ' + formatARS(r.panelCostARS) + '</span></div>';
  if (r.selectedInverters.length > 0) {
    r.selectedInverters.forEach(inv => {
      equipHtml += '<div class="cost-row"><span><strong>' + esc((inv.qty > 1 ? inv.qty + 'x ' : '')) + '</strong>' + esc(inv.name) + '</span><span>' + (inv.watts / 1000) + ' kW — ' + formatARS(inv.priceARS || 0) + '</span></div>';
    });
  } else {
    equipHtml += '<div class="cost-row"><span>Inversor</span><span style="color:var(--warning);">Consultar — dimensionamiento especial</span></div>';
  }
  if (r.batteryCount > 0 && r.selectedBattery) {
    equipHtml += '<div class="cost-row"><span><strong>' + esc(r.batteryCount + 'x') + '</strong> ' + esc(r.selectedBattery) + '</span><span>' + r.batteryKwh + ' kWh — ' + formatARS(r.batteryCostARS) + '</span></div>';
  }
  el('r-equipment-list').innerHTML = equipHtml;

  // Show results
  const resultsEl = document.getElementById('results');
  resultsEl.classList.add('visible');
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// Category filter + order
const CATEGORY_ORDER = ['panel','inversor','inversor-offgrid','inversor-hibrido','bateria','estructura','proteccion','monitoring','wifi','termotanque','powermeter'];

// ---------- Render Products ----------
let activeFilter = 'all';

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

  // Filter and render
  const filtered = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);
  grid.innerHTML = '';

  filtered.forEach(p => {
    const priceARS = calcFinalPriceARS(p);
    const usd = p.flexPriceUSD || p.priceUSD;
    const label = CATEGORY_LABELS[p.category] || p.category;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <span class="category-tag">${label}</span>
      <h3>${p.name}</h3>
      <p class="desc">${p.description}</p>
      <div class="price">${formatARS(priceARS)}</div>
      <div class="price-usd">${formatUSD(usd)} + IVA ${(p.iva * 100).toFixed(1)}%</div>
    `;
    grid.appendChild(card);
  });
}

function filterProducts(cat) {
  activeFilter = cat;
  renderProducts();
}

// ---------- PDF Export ----------
function exportPDF() {
  if (!currentResult) return;
  const r = currentResult;
  const date = new Date().toLocaleDateString('es-AR');

  const batterySection = r.systemType !== 'ongrid' && r.batteryCount > 0 ? `
    <tr><td>${r.batteryCount}x ${r.selectedBattery} (${r.batteryTypeLabel})</td><td style="text-align:right">${formatARS(r.batteryCostARS)}</td></tr>
    <tr><td>Autonomia</td><td style="text-align:right">${r.autonomyDays} dias / ${r.batteryKwh} kWh</td></tr>
  ` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Presupuesto Solar - Navimaq</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#222;}
  h1{color:#00875a;font-size:1.5rem;border-bottom:3px solid #00875a;padding-bottom:0.5rem;}
  h2{color:#333;font-size:1.1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:0.3rem;}
  table{width:100%;border-collapse:collapse;margin:0.5rem 0;}
  td{padding:0.4rem 0.5rem;border-bottom:1px solid #eee;}
  .total td{font-weight:700;font-size:1.1rem;border-top:2px solid #00875a;border-bottom:none;}
  .highlight{background:#f0faf6;}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;}
  .meta{color:#666;font-size:0.85rem;}
  .green{color:#00875a;font-weight:700;}
  .savings-box{background:#f0faf6;padding:1rem;border-radius:8px;margin:1rem 0;display:flex;justify-content:space-around;text-align:center;}
  .savings-box div{flex:1;}
  .savings-box .val{font-size:1.3rem;font-weight:700;color:#00875a;}
  .footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;font-size:0.8rem;color:#888;text-align:center;}
  @media print{body{padding:1rem;}}
</style></head><body>
<div class="header">
  <h1>Presupuesto Solar — Navimaq</h1>
  <div class="meta">Fecha: ${date}<br>Sistema: ${r.systemTypeLabel}<br>${r.province} (${r.hsp} HSP)</div>
</div>

<h2>Sistema recomendado</h2>
<table>
  <tr class="highlight"><td>Paneles</td><td style="text-align:right"><strong>${r.numPanels}x ${r.selectedPanel} (${r.panelWatts}W)</strong></td></tr>
  <tr><td>Potencia total</td><td style="text-align:right">${formatNumber(r.systemKwp)} kWp</td></tr>
  <tr><td>Superficie</td><td style="text-align:right">${formatNumber(r.areaM2)} m²</td></tr>
  <tr><td>Inversor</td><td style="text-align:right">${r.selectedInverters.map(i => (i.qty > 1 ? i.qty + 'x ' : '') + i.name).join(', ') || 'Consultar'}</td></tr>
  ${batterySection}
  <tr><td>Cobertura</td><td style="text-align:right"><strong>${Math.round(r.coveragePercent)}%</strong> del consumo</td></tr>
</table>

<h2>Desglose de costos</h2>
<table>
  <tr><td>Paneles (${r.numPanels}x)</td><td style="text-align:right">${formatARS(r.panelCostARS)}</td></tr>
  <tr><td>Inversor</td><td style="text-align:right">${formatARS(r.inverterCostARS)}</td></tr>
  ${r.batteryCostARS > 0 ? '<tr><td>Baterias</td><td style="text-align:right">' + formatARS(r.batteryCostARS) + '</td></tr>' : ''}
  <tr><td>Estructura</td><td style="text-align:right">${formatARS(r.structureCostARS)}</td></tr>
  <tr><td>Instalacion</td><td style="text-align:right">${formatARS(r.installCostARS)}</td></tr>
  <tr class="total"><td>INVERSION TOTAL</td><td style="text-align:right">${formatARS(r.totalCostARS)}</td></tr>
</table>

<h2>Tu factura antes y despues</h2>
<div class="savings-box">
  <div><div class="meta">Hoy pagas</div><div class="val" style="color:#c0392b;">${formatARS(r.monthlyBillBefore)}</div><div class="meta">por mes</div></div>
  <div><div class="meta">Con solar</div><div class="val">${formatARS(r.monthlyBillAfter)}</div><div class="meta">por mes</div></div>
  <div><div class="meta">Ahorras</div><div class="val">${Math.round(r.billReductionPct)}%</div><div class="meta">${formatARS(r.monthlySavingsARS)}/mes</div></div>
</div>

<h2>Retorno de inversion</h2>
<div class="savings-box">
  <div><div class="meta">Ahorro anual</div><div class="val">${formatARS(r.annualSavingsARS)}</div></div>
  <div><div class="meta">Recupero</div><div class="val">${r.paybackYears >= 50 ? 'N/A' : formatNumber(r.paybackYears) + ' años'}</div></div>
  <div><div class="meta">ROI 25 años</div><div class="val">${Math.round(r.roi25years)}%</div></div>
</div>

<h2>Impacto ambiental</h2>
<table>
  <tr><td>Generacion anual</td><td style="text-align:right">${formatNumber(r.annualGenerationKwh)} kWh/año</td></tr>
  <tr><td>CO² evitado</td><td style="text-align:right">${formatNumber(r.annualCO2kg)} kg/año</td></tr>
  <tr><td>Arboles equivalentes</td><td style="text-align:right">${r.treesEquivalent} arboles</td></tr>
</table>

<div class="footer">
  <p><strong>Navimaq Solar</strong> — navimaqsolar.com.ar</p>
  <p>Precios al tipo de cambio del dia. Valores estimativos sujetos a confirmacion.</p>
  <p>Consumo mensual analizado: ${formatNumber(r.monthlyKwh)} kWh — Tarifa: ${r.tariffLabel}</p>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url);
  setTimeout(() => { w.print(); }, 500);
}
