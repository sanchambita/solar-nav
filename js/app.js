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
  checkOllama();
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

// ---------- Input mode toggle ----------
let currentMode = 'kwh';

function setInputMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.input-toggle button').forEach((btn, i) => {
    btn.classList.toggle('active', ['kwh', 'money', 'upload'][i] === mode);
  });
  document.getElementById('mode-kwh').style.display = mode === 'kwh' ? 'block' : 'none';
  document.getElementById('mode-money').style.display = mode === 'money' ? 'block' : 'none';
  document.getElementById('mode-upload').style.display = mode === 'upload' ? 'block' : 'none';
}

// ---------- Ollama integration ----------
let ollamaUrl = localStorage.getItem('solarnav_ollama_url') || '';

async function checkOllama() {
  const statusEl = document.getElementById('ollama-status');
  if (!ollamaUrl) {
    statusEl.innerHTML = '<span class="ollama-status disconnected">Ollama no configurado — usa input manual o configura en Admin</span>';
    return;
  }
  try {
    const res = await fetch(ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusEl.innerHTML = '<span class="ollama-status connected">Ollama conectado</span>';
    } else {
      throw new Error();
    }
  } catch {
    statusEl.innerHTML = '<span class="ollama-status disconnected">Ollama no disponible en ' + ollamaUrl + '</span>';
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

async function processFile(file) {
  if (!ollamaUrl) {
    alert('Configura la URL de Ollama en Admin para usar esta funcion.');
    return;
  }

  const area = document.getElementById('upload-area');
  area.innerHTML = '<div class="upload-icon">&#9203;</div><p>Analizando factura con IA...</p>';

  try {
    // Convert to base64
    const base64 = await fileToBase64(file);

    const response = await fetch(ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llava',
        prompt: 'Analiza esta factura de electricidad argentina. Extrae y devuelve SOLO un JSON con estos campos: {"consumo_kwh": number, "monto_total": number, "proveedor": string, "periodo": string, "titular": string}. Si no puedes determinar un campo, usa null. Solo devuelve el JSON, nada mas.',
        images: [base64.split(',')[1]],
        stream: false,
      }),
    });

    const data = await response.json();
    const jsonMatch = data.response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      showBillResult(extracted);

      // Auto-fill consumption
      if (extracted.consumo_kwh) {
        document.getElementById('input-kwh').value = extracted.consumo_kwh;
        setInputMode('kwh');
      } else if (extracted.monto_total) {
        document.getElementById('input-money').value = extracted.monto_total;
        setInputMode('money');
      }
    } else {
      throw new Error('No se pudo extraer datos');
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

  let html = '';
  if (data.proveedor) html += '<div class="cost-row"><span>Proveedor</span><span>' + data.proveedor + '</span></div>';
  if (data.consumo_kwh) html += '<div class="cost-row"><span>Consumo</span><span>' + data.consumo_kwh + ' kWh</span></div>';
  if (data.monto_total) html += '<div class="cost-row"><span>Monto</span><span>' + formatARS(data.monto_total) + '</span></div>';
  if (data.periodo) html += '<div class="cost-row"><span>Periodo</span><span>' + data.periodo + '</span></div>';
  if (data.titular) html += '<div class="cost-row"><span>Titular</span><span>' + data.titular + '</span></div>';

  extractedDiv.innerHTML = html;
  resultDiv.style.display = 'block';
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
  const tariffId = document.getElementById('tariff').value;

  if (!provinceId) { alert('Selecciona una provincia'); return; }
  if (!tariffId) { alert('Selecciona un proveedor de energia'); return; }

  let monthlyKwh;

  if (currentMode === 'kwh' || currentMode === 'upload') {
    monthlyKwh = parseFloat(document.getElementById('input-kwh').value);
  } else {
    const amount = parseFloat(document.getElementById('input-money').value);
    if (!amount) { alert('Ingresa el monto de tu factura'); return; }
    monthlyKwh = estimateKwhFromBill(amount, tariffId);
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
  let equipHtml = '<div class="cost-row"><span>' + r.numPanels + 'x ' + r.selectedPanel + '</span><span>' + r.panelWatts + 'W c/u</span></div>';
  r.selectedInverters.forEach(inv => {
    equipHtml += '<div class="cost-row"><span>' + (inv.qty > 1 ? inv.qty + 'x ' : '') + inv.name + '</span><span>' + (inv.watts / 1000) + ' kW</span></div>';
  });
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
