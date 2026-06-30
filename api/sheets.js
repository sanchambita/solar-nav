// Fetch products and config from a published Google Sheet
// Sheet must be published to web (File > Share > Publish to web)
// Env var: GOOGLE_SHEET_ID
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!SHEET_ID) {
    return res.status(200).json({ products: null, config: null });
  }

  try {
    const [products, config] = await Promise.all([
      fetchSheet(SHEET_ID, 'Productos'),
      fetchSheet(SHEET_ID, 'Config'),
    ]);

    const parsedProducts = parseProducts(products);
    const parsedConfig = parseConfig(config);

    return res.status(200).json({
      products: parsedProducts.length > 0 ? parsedProducts : null,
      config: Object.keys(parsedConfig).length > 0 ? parsedConfig : null,
    });
  } catch (err) {
    console.error('Sheets fetch error:', err.message);
    return res.status(200).json({ products: null, config: null, error: err.message });
  }
}

async function fetchSheet(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Sheet "${tabName}" not found (${resp.status})`);
  return await resp.text();
}

function parseCSV(csv) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const lines = [];

  // Split into lines respecting quoted newlines
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cell += '"'; i++; }
        else q = !q;
      } else if (ch === ',' && !q) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

function parseProducts(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const products = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    const obj = {};
    headers.forEach((h, j) => {
      const val = row[j] || '';
      obj[h] = val;
    });

    // Parse numeric fields
    const rawIva = parseFloat(obj.iva) || 0.21;
    // Google Sheets locale fix: 0.105 puede exportarse como 105, 0.21 como 21
    const iva = rawIva > 1 ? rawIva / 1000 : rawIva;

    const product = {
      id: parseInt(obj.id) || 7000 + i,
      category: obj.category || 'panel',
      sku: obj.sku || '',
      name: obj.name || '',
      description: obj.description || '',
      priceUSD: parseNum(obj.priceusd),
      priceARS: parseNum(obj.pricears),
      iva,
      watts: obj.watts ? parseInt(obj.watts) : null,
      brand: obj.brand || '',
    };

    // Optional fields
    if (obj.phase) product.phase = obj.phase;
    if (obj.voltage) product.voltage = parseInt(obj.voltage);
    if (obj.capacitykwh) product.capacityKwh = parseFloat(obj.capacitykwh);
    if (obj.maxdischargew) product.maxDischargeW = parseInt(obj.maxdischargew);
    if (obj.rooftype) product.roofType = obj.rooftype;
    if (obj.panelsperkit) product.panelsPerKit = parseInt(obj.panelsperkit);

    products.push(product);
  }

  return products;
}

// Parse numbers handling comma decimal separator (Argentine locale)
function parseNum(str) {
  if (!str) return 0;
  // Replace comma with period for locale compatibility
  const cleaned = String(str).replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
}

function parseConfig(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return {};

  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = (rows[i][0] || '').trim();
    const val = (rows[i][1] || '').trim();
    if (!key || !val) continue;

    // Try numeric (handle comma decimal)
    const cleaned = val.replace(/,/g, '.');
    const num = Number(cleaned);
    config[key] = isNaN(num) ? val : num;
  }

  return config;
}
