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

// ---------- Gemini AI integration ----------
let geminiKey = localStorage.getItem('solarnav_gemini_key') || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function checkAI() {
  const statusEl = document.getElementById('ollama-status');
  if (!geminiKey) {
    statusEl.innerHTML = '<span class="ollama-status disconnected">Gemini no configurado — configura la API Key en <a href="/admin.html" style="color:var(--accent);">Admin</a></span>';
    return;
  }
  try {
    const res = await fetch(GEMINI_URL + '?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      statusEl.innerHTML = '<span class="ollama-status connected">Gemini AI conectado</span>';
    } else {
      throw new Error();
    }
  } catch {
    statusEl.innerHTML = '<span class="ollama-status disconnected">Gemini no disponible — verifica tu API Key en Admin</span>';
  }
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

const BILL_PROMPT = `Analiza esta factura de electricidad de Argentina. Busca estos datos exactos y devuelve SOLO un JSON sin markdown:

{
  "proveedor": "EDENOR" o "EDESUR" o "EPEC" o el nombre que figure,
  "tarifa": "T1-R3" o lo que diga en el campo TARIFA,
  "tipo_tarifa": "T1" o "T2" o "T3",
  "actividad": "RESIDENCIAL" o "COMERCIAL" o "INDUSTRIAL",
  "consumo_kwh": numero total de kWh consumidos (buscar "Total Consumo" o "kWh"),
  "dias_periodo": dias del periodo de facturacion,
  "monto_total": monto de "Total a pagar" en pesos,
  "cargo_fijo": monto del cargo fijo,
  "cargo_variable_1": monto del primer tramo variable,
  "cargo_variable_2": monto del segundo tramo variable si existe,
  "conceptos_electricos": subtotal de conceptos electricos,
  "impuestos": monto de impuestos y contribuciones,
  "subsidio": monto del subsidio si existe,
  "nivel_subsidio": "NIVEL 1" o "NIVEL 2" o "NIVEL 3" o "SIN SUBSIDIO",
  "titular": nombre del titular,
  "direccion": direccion completa del suministro/servicio,
  "localidad": ciudad o localidad,
  "provincia": provincia (ej: "Buenos Aires", "CABA", "Cordoba"),
  "periodo": periodo de consumo (ej: "18/12/2025 AL 21/01/2026"),
  "numero_cuenta": numero de cuenta o suministro
}

Si no puedes determinar un campo usa null. SOLO devuelve el JSON, sin backticks ni markdown.`;

async function processFile(file) {
  if (!geminiKey) {
    alert('Configura la API Key de Gemini en Admin para usar esta funcion.');
    return;
  }

  const area = document.getElementById('upload-area');
  area.innerHTML = '<div class="upload-icon">&#9203;</div><p>Analizando factura con IA...</p><p style="font-size:0.8rem; color:var(--text-muted);">Unos segundos...</p>';

  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    const b64data = base64.split(',')[1];

    const response = await fetch(GEMINI_URL + '?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: BILL_PROMPT },
            { inline_data: { mime_type: mimeType, data: b64data } }
          ]
        }]
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Error de Gemini API');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      showBillResult(extracted);
      autoFillFromBill(extracted);
    } else {
      throw new Error('No se pudo extraer datos de la factura');
    }
  } catch (err) {
    area.innerHTML = '<div class="upload-icon">&#10060;</div><p>Error al analizar: ' + err.message + '</p><p>Intenta con input manual</p>';
  }
}

function showBillResult(data) {
  const area = document.getElementById('upload-area');
  area.innerHTML = '<div class="upload-icon">&#9989;</div><p><strong>Factura analizada correctamente</strong></p>';

  const resultDiv = document.getElementById('bill-result');
  const extractedDiv = document.getElementById('bill-extracted');

  const row = (label, value) => '<div class="cost-row"><span>' + label + '</span><span>' + value + '</span></div>';

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

  const result = calculateSolar({ provinceId, monthlyKwh, tariffId });

  if (result.error) {
    alert(result.error);
    return;
  }

  renderResults(result);
}

// ---------- Render Results ----------
function renderResults(r) {
  const el = id => document.getElementById(id);

  // Key metrics
  el('r-panels').textContent = r.numPanels;
  el('r-power').textContent = formatNumber(r.systemKwp);
  el('r-area').textContent = formatNumber(r.areaM2);
  el('r-coverage').textContent = Math.round(r.coveragePercent) + '%';

  // Cost breakdown
  el('r-panel-detail').textContent = r.numPanels + 'x ' + r.selectedPanel;
  el('r-cost-panels').textContent = formatARS(r.panelCostARS);

  const invDetail = r.selectedInverters.map(i => (i.qty > 1 ? i.qty + 'x ' : '') + i.name).join(', ');
  el('r-inverter-detail').textContent = invDetail || 'No seleccionado';
  el('r-cost-inverter').textContent = formatARS(r.inverterCostARS);

  el('r-cost-structure').textContent = formatARS(r.structureCostARS);
  el('r-cost-install').textContent = formatARS(r.installCostARS);
  el('r-cost-total').textContent = formatARS(r.totalCostARS);

  // Savings
  el('r-save-month').textContent = formatARS(r.monthlySavingsARS);
  el('r-save-year').textContent = formatARS(r.annualSavingsARS);
  el('r-payback').textContent = formatNumber(r.paybackYears) + ' anos';
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
  let equipHtml = '<div class="cost-row"><span><strong>' + r.numPanels + 'x</strong> ' + r.selectedPanel + '</span><span>' + r.panelWatts + 'W c/u — ' + formatARS(r.panelCostARS) + '</span></div>';
  if (r.selectedInverters.length > 0) {
    r.selectedInverters.forEach(inv => {
      equipHtml += '<div class="cost-row"><span><strong>' + (inv.qty > 1 ? inv.qty + 'x ' : '') + '</strong>' + inv.name + '</span><span>' + (inv.watts / 1000) + ' kW — ' + formatARS(inv.priceARS || 0) + '</span></div>';
    });
  } else {
    equipHtml += '<div class="cost-row"><span>Inversor</span><span style="color:var(--warning);">Consultar — sistema requiere dimensionamiento especial</span></div>';
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
