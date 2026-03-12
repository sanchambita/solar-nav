// ============================================================
// SOLAR NAV - Data Module
// Productos, provincias, tarifas, configuración
// ============================================================

const CONFIG = {
  dollarRate: 1443.3,    // Dólar blue + 2%
  margin: 1.40,          // 40% ganancia y utilidad
  efficiency: 0.80,      // Factor eficiencia del sistema
  panelArea: 2.2,        // m² por panel promedio
  installCostPercent: 0.20, // 20% costo instalación sobre equipamiento
  structurePercent: 0.12,   // 12% estructura sobre costo paneles
  co2Factor: 0.5,        // kg CO2/kWh factor red argentina
  defaultPanelWp: 550,   // Watts pico panel por defecto
};

// Horas Solar Pico (HSP) promedio anual por provincia
const PROVINCES = [
  { id: 'bsas', name: 'Buenos Aires', hsp: 4.5 },
  { id: 'caba', name: 'CABA', hsp: 4.4 },
  { id: 'catamarca', name: 'Catamarca', hsp: 5.8 },
  { id: 'chaco', name: 'Chaco', hsp: 5.0 },
  { id: 'chubut', name: 'Chubut', hsp: 4.2 },
  { id: 'cordoba', name: 'Córdoba', hsp: 5.0 },
  { id: 'corrientes', name: 'Corrientes', hsp: 4.8 },
  { id: 'entrerios', name: 'Entre Ríos', hsp: 4.6 },
  { id: 'formosa', name: 'Formosa', hsp: 5.2 },
  { id: 'jujuy', name: 'Jujuy', hsp: 5.5 },
  { id: 'lapampa', name: 'La Pampa', hsp: 5.0 },
  { id: 'larioja', name: 'La Rioja', hsp: 5.8 },
  { id: 'mendoza', name: 'Mendoza', hsp: 5.5 },
  { id: 'misiones', name: 'Misiones', hsp: 4.5 },
  { id: 'neuquen', name: 'Neuquén', hsp: 4.8 },
  { id: 'rionegro', name: 'Río Negro', hsp: 4.8 },
  { id: 'salta', name: 'Salta', hsp: 5.5 },
  { id: 'sanjuan', name: 'San Juan', hsp: 6.2 },
  { id: 'sanluis', name: 'San Luis', hsp: 5.5 },
  { id: 'santacruz', name: 'Santa Cruz', hsp: 3.8 },
  { id: 'santafe', name: 'Santa Fe', hsp: 4.7 },
  { id: 'santiago', name: 'Santiago del Estero', hsp: 5.5 },
  { id: 'tierradelfuego', name: 'Tierra del Fuego', hsp: 3.2 },
  { id: 'tucuman', name: 'Tucumán', hsp: 5.2 },
];

// Tarifas EDENOR residencial (ARS/kWh aproximado, actualizable desde admin)
const TARIFFS = [
  { id: 'edenor', name: 'EDENOR', provider: 'edenor', ranges: [
    { min: 0, max: 150, priceKwh: 25, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 45, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 450, priceKwh: 65, label: 'R3 (326-450 kWh)' },
    { min: 451, max: 600, priceKwh: 85, label: 'R4 (451-600 kWh)' },
    { min: 601, max: 800, priceKwh: 105, label: 'R5 (601-800 kWh)' },
    { min: 801, max: 900, priceKwh: 130, label: 'R6 (801-900 kWh)' },
    { min: 901, max: 1000, priceKwh: 155, label: 'R7 (901-1000 kWh)' },
    { min: 1001, max: 1200, priceKwh: 175, label: 'R8 (1001-1200 kWh)' },
    { min: 1201, max: 99999, priceKwh: 200, label: 'R9 (+1200 kWh)' },
  ]},
  { id: 'edesur', name: 'EDESUR', provider: 'edesur', ranges: [
    { min: 0, max: 150, priceKwh: 24, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 43, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 450, priceKwh: 62, label: 'R3 (326-450 kWh)' },
    { min: 451, max: 600, priceKwh: 82, label: 'R4 (451-600 kWh)' },
    { min: 601, max: 800, priceKwh: 100, label: 'R5 (601-800 kWh)' },
    { min: 801, max: 900, priceKwh: 125, label: 'R6 (801-900 kWh)' },
    { min: 901, max: 1000, priceKwh: 150, label: 'R7 (901-1000 kWh)' },
    { min: 1001, max: 1200, priceKwh: 170, label: 'R8 (1001-1200 kWh)' },
    { min: 1201, max: 99999, priceKwh: 195, label: 'R9 (+1200 kWh)' },
  ]},
  { id: 'epec', name: 'EPEC (Córdoba)', provider: 'epec', ranges: [
    { min: 0, max: 150, priceKwh: 22, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 40, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 500, priceKwh: 58, label: 'R3 (326-500 kWh)' },
    { min: 501, max: 99999, priceKwh: 75, label: 'R4 (+500 kWh)' },
  ]},
];

// Productos — se pueden agregar/editar desde admin
const DEFAULT_PRODUCTS = [
  // === INVERSORES ===
  {
    id: 1176,
    category: 'inversor',
    name: 'Inversor Goodwe GW1500-NS (WiFi)',
    description: 'On Grid 1500W monofásico. 1 string. MPPT 80-450V CC. Pantalla LCD. WiFi incorporado.',
    priceUSD: 263.00,
    flexPriceUSD: null,
    iva: 0.21,
    watts: 1500,
    phase: 'mono',
    brand: 'Goodwe',
    cashDiscount: 0.15,
  },
  {
    id: 5726,
    category: 'inversor',
    name: 'Inversor Goodwe GW6000-SDT-20 (WiFi)',
    description: 'On Grid 6kW trifásico 380V. MPPT 180-850V CC. SPD CC tipo II, SPD CA tipo III. WiFi incorporado.',
    priceUSD: 893.00,
    flexPriceUSD: null,
    iva: 0.21,
    watts: 6000,
    phase: 'tri',
    brand: 'Goodwe',
    cashDiscount: 0.15,
  },
  {
    id: 4208,
    category: 'inversor',
    name: 'Inversor Growatt MIC1500TL-X',
    description: 'On Grid 1.5kW monofásico. MPPT 50-500V CC. Máx paneles 2.1kW. WiFi optativo.',
    priceUSD: 280.00,
    flexPriceUSD: null,
    iva: 0.21,
    watts: 1500,
    phase: 'mono',
    brand: 'Growatt',
    cashDiscount: 0.15,
  },
  {
    id: 5936,
    category: 'inversor',
    name: 'Inversor Growatt MID 20KTL3-X2',
    description: 'On Grid 20kW trifásico 380V. MPPT 200-1000V CC. 2 MPPTs, 2 strings/MPPT. Protecciones tipo II.',
    priceUSD: 1190.00,
    flexPriceUSD: null,
    iva: 0.21,
    watts: 20000,
    phase: 'tri',
    brand: 'Growatt',
    cashDiscount: 0.15,
  },
  {
    id: 5931,
    category: 'inversor',
    name: 'Inversor Growatt MAX60KTL3 LV',
    description: 'On Grid 60kW trifásico 380V. MPPT 200-1000V CC. 6 MPPTs, 2 strings/MPPT. Protecciones tipo II.',
    priceUSD: 2650.00,
    flexPriceUSD: null,
    iva: 0.21,
    watts: 60000,
    phase: 'tri',
    brand: 'Growatt',
    cashDiscount: 0.15,
  },
  // === PANELES (precios estimados - actualizar desde admin) ===
  {
    id: 9001,
    category: 'panel',
    name: 'Panel Solar 550W Monocristalino',
    description: 'Panel monocristalino 550Wp. Half-cell. Alta eficiencia.',
    priceUSD: 125.00,
    flexPriceUSD: null,
    iva: 0.105,
    watts: 550,
    brand: 'Genérico',
    cashDiscount: 0.15,
  },
  {
    id: 9002,
    category: 'panel',
    name: 'Panel Solar 450W Monocristalino',
    description: 'Panel monocristalino 450Wp. Half-cell.',
    priceUSD: 105.00,
    flexPriceUSD: null,
    iva: 0.105,
    watts: 450,
    brand: 'Genérico',
    cashDiscount: 0.15,
  },
  {
    id: 9003,
    category: 'panel',
    name: 'Panel Solar 660W Bifacial',
    description: 'Panel bifacial 660Wp. Mayor rendimiento.',
    priceUSD: 160.00,
    flexPriceUSD: null,
    iva: 0.105,
    watts: 660,
    brand: 'Genérico',
    cashDiscount: 0.15,
  },
];

// ---------- Helpers ----------

function getProducts() {
  const stored = localStorage.getItem('solarnav_products');
  return stored ? JSON.parse(stored) : DEFAULT_PRODUCTS;
}

function saveProducts(products) {
  localStorage.setItem('solarnav_products', JSON.stringify(products));
}

function getConfig() {
  const stored = localStorage.getItem('solarnav_config');
  return stored ? { ...CONFIG, ...JSON.parse(stored) } : { ...CONFIG };
}

function saveConfig(cfg) {
  localStorage.setItem('solarnav_config', JSON.stringify(cfg));
}

function calcFinalPriceARS(product) {
  const cfg = getConfig();
  const usd = product.flexPriceUSD || product.priceUSD;
  return usd * cfg.dollarRate * (1 + product.iva) * cfg.margin;
}

function formatARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function formatUSD(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n);
}
