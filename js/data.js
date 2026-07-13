// ============================================================
// SOLAR NAV - Data Module
// Productos, provincias, tarifas, configuración
// ============================================================

const CONFIG = {
  dollarRate: 1500,      // Fallback — se actualiza con BNA en init
  margin: 1.40,          // Solo para productos sin priceARS
  efficiency: 0.80,      // Factor eficiencia del sistema
  panelArea: 2.2,        // m² por panel promedio
  co2Factor: 0.5,        // kg CO2/kWh factor red argentina
  defaultPanelWp: 550,   // Watts pico panel por defecto
  panelDegradation: 0.005,     // 0.5%/año degradación paneles
  whatsappNumber: '5491155881126',

  // Metodología Excel Colo — Balance neto de facturación
  selfConsumptionQuota: 0.60,  // Cuota autoconsumo: 60% del consumo ocurre en horas solares
  injectionPriceKwh: 105.1,    // Tarifa inyección ENRE [$/kWh] (Ley 27.424)
  municipalTax: 0.064,         // Contribución municipal sobre factura
  billIVA: 0.21,               // IVA sobre factura eléctrica
  projectLifeYears: 20,        // Vida útil del proyecto (Excel: 20 años)
  discountRate: 0,             // Tasa de descuento para VAN (0 = sin descuento)
  tariffInflation: 0,          // Inflación tarifaria (Excel: precios constantes)
  inverterLifeYears: 20,       // Vida útil inversor (Excel: sin reposición en 20 años)
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

// Factores estacionales HSP (Ene→Dic). Multiplicadores sobre HSP anual.
const HSP_MONTHLY_FACTORS = [1.25, 1.20, 1.10, 0.95, 0.80, 0.70, 0.65, 0.75, 0.90, 1.05, 1.15, 1.25];

// Tarifas eléctricas Argentina (ARS/kWh efectivo incluyendo impuestos proporcionales)
// Basado en factura real EDENOR Enero 2026: 518kWh = $72,300 → ~$139.58/kWh efectivo
// Cargo variable: hasta 350kWh=$70.48/kWh, >350kWh=$94.44/kWh + ~40% impuestos/tasas
// T1 = Pequeña demanda (residencial/comercial hasta 10kW)
// T2 = Mediana demanda (comercial/industrial 10-50kW, trifásica)
// T3 = Gran demanda (industrial >50kW, trifásica)
const TARIFFS = [
  // --- EDENOR ---
  { id: 'edenor-t1-res', name: 'EDENOR T1 Residencial', provider: 'edenor', type: 'T1', phase: 'mono', ranges: [
    { min: 0, max: 150, priceKwh: 85, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 100, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 450, priceKwh: 120, label: 'R3 (326-450 kWh)' },
    { min: 451, max: 600, priceKwh: 140, label: 'R4 (451-600 kWh)' },
    { min: 601, max: 800, priceKwh: 160, label: 'R5 (601-800 kWh)' },
    { min: 801, max: 1000, priceKwh: 185, label: 'R6 (801-1000 kWh)' },
    { min: 1001, max: 1400, priceKwh: 210, label: 'R7 (1001-1400 kWh)' },
    { min: 1401, max: 99999, priceKwh: 240, label: 'R8 (+1400 kWh)' },
  ]},
  { id: 'edenor-t1-com', name: 'EDENOR T1 Comercial', provider: 'edenor', type: 'T1', phase: 'mono', ranges: [
    { min: 0, max: 800, priceKwh: 130, label: 'G1 (0-800 kWh)' },
    { min: 801, max: 1600, priceKwh: 165, label: 'G2 (801-1600 kWh)' },
    { min: 1601, max: 99999, priceKwh: 200, label: 'G3 (+1600 kWh)' },
  ]},
  { id: 'edenor-t2', name: 'EDENOR T2 Mediana demanda (trifásica)', provider: 'edenor', type: 'T2', phase: 'tri', demandChargeKw: 8500, ranges: [
    { min: 0, max: 5000, priceKwh: 105, label: 'Hasta 5000 kWh' },
    { min: 5001, max: 15000, priceKwh: 125, label: '5001-15000 kWh' },
    { min: 15001, max: 99999, priceKwh: 140, label: '+15000 kWh' },
  ]},
  { id: 'edenor-t3', name: 'EDENOR T3 Gran demanda (trifásica)', provider: 'edenor', type: 'T3', phase: 'tri', demandChargeKw: 12000, ranges: [
    { min: 0, max: 99999, priceKwh: 95, label: 'Tarifa unica' },
  ]},
  // --- EDESUR ---
  { id: 'edesur-t1-res', name: 'EDESUR T1 Residencial', provider: 'edesur', type: 'T1', phase: 'mono', ranges: [
    { min: 0, max: 150, priceKwh: 82, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 97, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 450, priceKwh: 115, label: 'R3 (326-450 kWh)' },
    { min: 451, max: 600, priceKwh: 135, label: 'R4 (451-600 kWh)' },
    { min: 601, max: 800, priceKwh: 155, label: 'R5 (601-800 kWh)' },
    { min: 801, max: 1000, priceKwh: 180, label: 'R6 (801-1000 kWh)' },
    { min: 1001, max: 1400, priceKwh: 205, label: 'R7 (1001-1400 kWh)' },
    { min: 1401, max: 99999, priceKwh: 235, label: 'R8 (+1400 kWh)' },
  ]},
  { id: 'edesur-t1-com', name: 'EDESUR T1 Comercial', provider: 'edesur', type: 'T1', phase: 'mono', ranges: [
    { min: 0, max: 800, priceKwh: 125, label: 'G1 (0-800 kWh)' },
    { min: 801, max: 1600, priceKwh: 160, label: 'G2 (801-1600 kWh)' },
    { min: 1601, max: 99999, priceKwh: 195, label: 'G3 (+1600 kWh)' },
  ]},
  { id: 'edesur-t2', name: 'EDESUR T2 Mediana demanda (trifásica)', provider: 'edesur', type: 'T2', phase: 'tri', demandChargeKw: 8200, ranges: [
    { min: 0, max: 5000, priceKwh: 100, label: 'Hasta 5000 kWh' },
    { min: 5001, max: 15000, priceKwh: 120, label: '5001-15000 kWh' },
    { min: 15001, max: 99999, priceKwh: 135, label: '+15000 kWh' },
  ]},
  { id: 'edesur-t3', name: 'EDESUR T3 Gran demanda (trifásica)', provider: 'edesur', type: 'T3', phase: 'tri', demandChargeKw: 11500, ranges: [
    { min: 0, max: 99999, priceKwh: 90, label: 'Tarifa unica' },
  ]},
  // --- EPEC (Córdoba) ---
  { id: 'epec-t1', name: 'EPEC T1 Residencial (Córdoba)', provider: 'epec', type: 'T1', phase: 'mono', ranges: [
    { min: 0, max: 150, priceKwh: 75, label: 'R1 (0-150 kWh)' },
    { min: 151, max: 325, priceKwh: 90, label: 'R2 (151-325 kWh)' },
    { min: 326, max: 500, priceKwh: 110, label: 'R3 (326-500 kWh)' },
    { min: 501, max: 99999, priceKwh: 130, label: 'R4 (+500 kWh)' },
  ]},
  { id: 'epec-t2', name: 'EPEC T2 Mediana demanda (Córdoba, trifásica)', provider: 'epec', type: 'T2', phase: 'tri', demandChargeKw: 7500, ranges: [
    { min: 0, max: 5000, priceKwh: 85, label: 'Hasta 5000 kWh' },
    { min: 5001, max: 99999, priceKwh: 105, label: '+5000 kWh' },
  ]},
];

// Costos de protecciones, instalación y cableado por kit (Excel CreativARTE)
// Precios en USD sell price (con margen incluido). IVA 21% se aplica aparte.
const SYSTEM_COSTS = [
  // Protecciones, instalación y cableado FIJOS por rango de potencia (Excel CreativARTE)
  // Precios en USD sell price (con margen incluido). IVA 21% se aplica aparte.
  // refPanels = paneles del kit Excel (para referencia, ya no se usa para escalar)
  // On Grid Mono
  { type: 'ongrid', phase: 'mono', maxWatts: 3000, refPanels: 4, protectionsUSD: 185.06, installUSD: 670, cablingUSD: 175.94 },
  { type: 'ongrid', phase: 'mono', maxWatts: 5000, refPanels: 8, protectionsUSD: 208.47, installUSD: 1100, cablingUSD: 178.74 },
  // On Grid Tri
  { type: 'ongrid', phase: 'tri', maxWatts: 6000, refPanels: 8, protectionsUSD: 208.47, installUSD: 1240, cablingUSD: 178.74 },
  { type: 'ongrid', phase: 'tri', maxWatts: 10000, refPanels: 12, protectionsUSD: 257.47, installUSD: 1670, cablingUSD: 238.94 },
  { type: 'ongrid', phase: 'tri', maxWatts: 20000, refPanels: 36, protectionsUSD: 512.51, installUSD: 4900, cablingUSD: 640.83 },
  { type: 'ongrid', phase: 'tri', maxWatts: 50000, refPanels: 96, protectionsUSD: 1254.78, installUSD: 8700, cablingUSD: 2697.43 },
  { type: 'ongrid', phase: 'tri', maxWatts: 100000, refPanels: 180, protectionsUSD: 1465.79, installUSD: 17550, cablingUSD: 8546.49 },
  // Híbrido Mono
  { type: 'hybrid', phase: 'mono', maxWatts: 6000, refPanels: 8, protectionsUSD: 386.51, installUSD: 1690, cablingUSD: 757.82 },
  // Híbrido Tri
  { type: 'hybrid', phase: 'tri', maxWatts: 10000, refPanels: 12, protectionsUSD: 386.51, installUSD: 1840, cablingUSD: 757.82 },
  // Off-Grid (usa costos híbrido como referencia)
  { type: 'offgrid', phase: 'mono', maxWatts: 6000, refPanels: 8, protectionsUSD: 386.51, installUSD: 1690, cablingUSD: 757.82 },
  { type: 'offgrid', phase: 'tri', maxWatts: 10000, refPanels: 12, protectionsUSD: 386.51, installUSD: 1840, cablingUSD: 757.82 },
];

function getSystemCosts(systemType, phaseType, inverterWatts) {
  const matching = SYSTEM_COSTS
    .filter(s => s.type === systemType && s.phase === phaseType && s.maxWatts >= inverterWatts)
    .sort((a, b) => a.maxWatts - b.maxWatts);
  if (matching.length > 0) return matching[0];
  // Fallback: largest kit for this type, or absolute largest
  const fallback = SYSTEM_COSTS
    .filter(s => s.type === systemType)
    .sort((a, b) => b.maxWatts - a.maxWatts);
  return fallback[0] || SYSTEM_COSTS[SYSTEM_COSTS.length - 1];
}

// Productos — solo componentes del Excel CreativARTE (precios USD descuento, margen 1.4x se aplica en calcFinalPriceARS)
const DEFAULT_PRODUCTS = [

  // === PANELES SOLARES (IVA 10.5%) — Precios USD descuento Excel ===
  { id: 7001, category: 'panel', sku: 'JKM550M72HL4V30', name: 'Panel Solar 550W Jinko Tiger Pro', description: 'Monocristalino 550Wp. 144 celdas, cable 1200mm, marco 30mm.', priceUSD: 97.94, iva: 0.105, watts: 550, brand: 'Jinko', maxSystemKw: 20 },
  { id: 7002, category: 'panel', sku: 'AS-7M144N-HC-580W', name: 'Panel Solar 580W Amerisolar N-Type', description: 'N-Type 580Wp. 144 celdas, cable 1280mm, marco 30mm.', priceUSD: 92.13, iva: 0.105, watts: 580, brand: 'Amerisolar', maxSystemKw: 999 },

  // === BATERÍA LITIO (IVA 21%) ===
  { id: 7010, category: 'bateria', sku: 'UF5000', name: 'Pylontech UF5000 LiFePO4 5.12kWh', description: 'Fosfato de Ion-Litio 51.2V 100Ah. 6000 ciclos DOD 95%. 10 años garantía.', priceUSD: 953.67, iva: 0.21, watts: null, brand: 'Pylontech', capacityKwh: 5.12, maxDischargeW: 5000 },

  // === INVERSORES ON-GRID MONOFÁSICOS (IVA 21%) ===
  { id: 7050, category: 'inversor', sku: 'MIN3000TL-X2', name: 'Growatt MIN3000TL-X2 On-Grid 3kW', description: 'On-Grid monofásico 3000W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 284.13, iva: 0.21, watts: 3000, brand: 'Growatt', phase: 'mono', voltage: 220 },
  { id: 7051, category: 'inversor', sku: 'MIN5000TL-X2', name: 'Growatt MIN5000TL-X2 On-Grid 5kW', description: 'On-Grid monofásico 2 MPPT 5000W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 522.9, iva: 0.21, watts: 5000, brand: 'Growatt', phase: 'mono', voltage: 220 },

  // === INVERSORES ON-GRID TRIFÁSICOS (IVA 21%) ===
  { id: 7060, category: 'inversor', sku: 'MOD6000TL3-X', name: 'Growatt MOD6000TL3-X On-Grid Tri 6kW', description: 'On-Grid trifásico 2 MPPT 6000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 485.55, iva: 0.21, watts: 6000, brand: 'Growatt', phase: 'tri', voltage: 380 },
  { id: 7061, category: 'inversor', sku: 'MOD10000TL3-X', name: 'Growatt MOD10000TL3-X On-Grid Tri 10kW', description: 'On-Grid trifásico 2 MPPT 10000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 516.26, iva: 0.21, watts: 10000, brand: 'Growatt', phase: 'tri', voltage: 380 },
  { id: 7062, category: 'inversor', sku: 'MID20KTL3-X2', name: 'Growatt MID20KTL3-X2 On-Grid Tri 20kW', description: 'On-Grid trifásico 2 MPPT 20000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 1368.67, iva: 0.21, watts: 20000, brand: 'Growatt', phase: 'tri', voltage: 380 },
  { id: 7063, category: 'inversor', sku: 'MID50KTL3-X2', name: 'Growatt MID50KTL3-X2 On-Grid Tri 50kW', description: 'On-Grid trifásico 4 MPPT 50000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 2217.76, iva: 0.21, watts: 50000, brand: 'Growatt', phase: 'tri', voltage: 380 },
  { id: 7064, category: 'inversor', sku: 'MAX100KTL3-X2 LV', name: 'Growatt MAX100KTL3-X2 On-Grid Tri 100kW', description: 'On-Grid trifásico 8 MPPT 100000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 3158.15, iva: 0.21, watts: 100000, brand: 'Growatt', phase: 'tri', voltage: 380 },

  // === INVERSORES HÍBRIDOS (IVA 21%) ===
  { id: 7070, category: 'inversor-hibrido', sku: 'SUN-6K-SG05LP1-EU-AM2-P', name: 'Deye SUN-6K Híbrido Mono 6kW', description: 'Híbrido monofásico 6kW IP65. 2 MPPT. Baterías 48V. Wifi + limitador inyección. 5 años garantía.', priceUSD: 929.6, iva: 0.21, watts: 6000, brand: 'Deye', phase: 'mono', voltage: 220 },
  { id: 7071, category: 'inversor-hibrido', sku: 'SUN-10K-SG05LP3-EU-SM2', name: 'Deye SUN-10K Híbrido Tri 10kW', description: 'Híbrido trifásico 10kW IP65. 2 MPPT. Baterías 48V. Wifi + limitador inyección. 5 años garantía.', priceUSD: 1695.69, iva: 0.21, watts: 10000, brand: 'Deye', phase: 'tri', voltage: 380 },

  // === ESTRUCTURA (IVA 21%) — Kit para 4 paneles ===
  { id: 7080, category: 'estructura', sku: 'CHIKOCOPLANAR2.4', name: 'Estructura Coplanar Chiko x4 paneles', description: 'Aluminio, perfil L para techo metálico coplanar. 4 perfiles de 2.4m. ~9kg.', priceUSD: 67.23, iva: 0.21, watts: null, brand: 'Chiko Solar', roofType: 'chapa', panelsPerKit: 4 },

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
  if (product.priceARS) return product.priceARS;
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

// ---------- Google Sheets override ----------
async function loadFromSheet() {
  try {
    const res = await fetch('/api/sheets');
    const data = await res.json();
    if (data.products && data.products.length > 0) {
      saveProducts(data.products);
      console.log('Productos cargados desde Google Sheet:', data.products.length);
    }
    if (data.config && Object.keys(data.config).length > 0) {
      saveConfig(data.config);
      console.log('Config cargada desde Google Sheet:', Object.keys(data.config));
    }
    return data;
  } catch (err) {
    console.warn('No se pudo cargar Google Sheet, usando datos locales:', err.message);
    return null;
  }
}
