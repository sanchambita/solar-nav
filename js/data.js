// ============================================================
// SOLAR NAV - Data Module
// Productos, provincias, tarifas, configuración
// ============================================================

const CONFIG = {
  dollarRate: 1443.3,    // Dólar blue + 2%
  margin: 1.40,          // 40% ganancia y utilidad
  efficiency: 0.80,      // Factor eficiencia del sistema
  panelArea: 2.2,        // m² por panel promedio
  installBaseUSD: 1500,       // USD fijo base por instalación
  installPerPanelUSD: 100,     // USD adicional por panel
  structurePercent: 0.12,   // 12% estructura sobre costo paneles
  co2Factor: 0.5,        // kg CO2/kWh factor red argentina
  defaultPanelWp: 550,   // Watts pico panel por defecto
  injectionPriceFactor: 0.50,  // Factor precio inyección vs consumo
  panelDegradation: 0.005,     // 0.5%/año degradación paneles
  tariffInflation: 0.30,       // 30% inflación tarifaria anual (configurable)
  inverterLifeYears: 12,       // Vida útil inversor
  whatsappNumber: '5491155881126',
  installMultipliers: { ongrid: 1.0, hybrid: 1.35, offgrid: 1.50 },
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

// Productos — se pueden agregar/editar desde admin
const DEFAULT_PRODUCTS = [

  // === PANELES SOLARES (IVA 10.5%) ===
  { id: 6104, category: 'panel', name: 'Panel Solar 615W Bifacial mono JINKO 66HL4M-BDV', description: 'Bifacial monocristalino 615Wp. Half-cell, dual glass.', priceUSD: 130, flexPriceUSD: 106.60, iva: 0.105, watts: 615, brand: 'Jinko', cashDiscount: 0 },
  { id: 6035, category: 'panel', name: 'Panel Solar 615W Bifacial mono ASTRO N7 dual glass', description: 'Bifacial monocristalino 615Wp. N-type, dual glass.', priceUSD: 125, flexPriceUSD: 102.50, iva: 0.105, watts: 615, brand: 'Astronergy', cashDiscount: 0 },
  { id: 6103, category: 'panel', name: 'Panel Solar 585W Bifacial mono JINKO 72HL4-BDV', description: 'Bifacial monocristalino 585Wp. Half-cell, dual glass.', priceUSD: 116, flexPriceUSD: 95.12, iva: 0.105, watts: 585, brand: 'Jinko', cashDiscount: 0 },
  { id: 6105, category: 'panel', name: 'Panel Solar 450W mono JINKO 54HL4R (V) Black frame', description: 'Monocristalino 450Wp. Half-cell, black frame.', priceUSD: 100, flexPriceUSD: 82, iva: 0.105, watts: 450, brand: 'Jinko', cashDiscount: 0.15 },
  { id: 5856, category: 'panel', name: 'Panel Solar 330W policristalino Nuuko NKP330-72M2', description: 'Policristalino 330Wp. 72 celdas.', priceUSD: 88, flexPriceUSD: 72.16, iva: 0.105, watts: 330, brand: 'Nuuko', cashDiscount: 0.15 },
  { id: 5391, category: 'panel', name: 'Panel Solar 290W AMERISOLAR', description: 'Policristalino 290Wp. Amerisolar.', priceUSD: 75.60, flexPriceUSD: 62, iva: 0.105, watts: 290, brand: 'Amerisolar', cashDiscount: 0.15 },
  { id: 5855, category: 'panel', name: 'Panel Solar 280W policristalino Nuuko NKP280-60M2', description: 'Policristalino 280Wp. 60 celdas.', priceUSD: 73, flexPriceUSD: 59.86, iva: 0.105, watts: 280, brand: 'Nuuko', cashDiscount: 0.15 },

  // === BATERIAS (IVA 21%) ===
  { id: 5685, category: 'bateria', name: 'Batería Litio Monobloque RT12100 12V 100Ah Pylontech', description: 'LiFePO4 12V 100Ah 1.28kWh. BMS integrado.', priceUSD: 488, flexPriceUSD: 400.20, iva: 0.21, watts: null, capacityKwh: 1.28, brand: 'Pylontech', cashDiscount: 0.15 },
  { id: 6025, category: 'bateria', name: 'Batería Litio Monobloque RV12200 12.8V 200Ah Pylontech', description: 'LiFePO4 12.8V 200Ah 2.56kWh. BMS integrado.', priceUSD: 695, flexPriceUSD: 569.90, iva: 0.21, watts: null, capacityKwh: 2.56, brand: 'Pylontech', cashDiscount: 0.15 },
  { id: 6019, category: 'bateria', name: 'Pylontech Batería Litio UF5000 51.2V 100Ah c/kit cables', description: 'LiFePO4 51.2V 100Ah 5.12kWh. Rack mount. Kit cables incluido.', priceUSD: 1125, flexPriceUSD: 922.50, iva: 0.21, watts: null, capacityKwh: 5.12, brand: 'Pylontech', cashDiscount: 0.15 },
  { id: 6020, category: 'bateria', name: 'Pylontech kit brackets para UF5000', description: 'Kit brackets montaje para batería UF5000.', priceUSD: 62, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Pylontech', cashDiscount: 0.15 },
  { id: 5219, category: 'bateria', name: 'KIT accesorios batería Growatt HOPE 4.8L-C1', description: 'Kit cables y accesorios para batería HOPE 4.8L-C1.', priceUSD: 58, flexPriceUSD: 47.60, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6111, category: 'bateria', name: 'KIT accesorios batería Growatt HOPE 5.0L-B1', description: 'Kit cables y accesorios para batería HOPE 5.0L-B1.', priceUSD: 45, flexPriceUSD: 36.90, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5862, category: 'bateria', name: 'KIT accesorios batería Growatt HOPE 5.5L-A1', description: 'Kit cables y accesorios para batería HOPE 5.5L-A1.', priceUSD: 60, flexPriceUSD: 49.20, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5494, category: 'bateria', name: 'Batería Litio GROWATT AXE5.0L-C1 51V 100Ah 5kWh', description: 'LiFePO4 51V 100Ah 5kWh. Alta tensión, rack mount.', priceUSD: 1580, flexPriceUSD: 1295.60, iva: 0.21, watts: null, capacityKwh: 5.0, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5495, category: 'bateria', name: 'AXE5.0L-C1 Cable para banco baterías', description: 'Cable conexión para banco baterías AXE5.0L-C1.', priceUSD: 120, flexPriceUSD: 98.40, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5496, category: 'bateria', name: 'AXE5.0L-C1 Base para banco baterías', description: 'Base soporte para banco baterías AXE5.0L-C1.', priceUSD: 37, flexPriceUSD: 30.30, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5895, category: 'bateria', name: 'Batería Litio XLYTE 48V 5.12kWh', description: 'LiFePO4 48V 5.12kWh. BMS integrado.', priceUSD: 2595, flexPriceUSD: null, iva: 0.21, watts: null, capacityKwh: 5.12, brand: 'XLYTE', cashDiscount: 0.15 },
  { id: 5037, category: 'bateria', name: 'Equilibrador de Baterías EQUIBATT 12+12V 1A', description: 'Equilibrador activo para baterías 12+12V. 1A.', priceUSD: 121.24, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'EQUIBATT', cashDiscount: 0.15 },
  { id: 4226, category: 'bateria', name: 'Batería DC12-225 12V 225Ah RITAR AGM', description: 'AGM Deep Cycle 12V 225Ah. Ciclo profundo.', priceUSD: 536, flexPriceUSD: null, iva: 0.21, watts: null, capacityKwh: 2.7, brand: 'Ritar', cashDiscount: 0 },

  // === BANCOS BATERIAS ALTA TENSION (IVA 21%) ===
  { id: 9201, category: 'bateria', name: 'Banco baterías alta tensión 20kWh Blunery', description: 'Banco baterías LiFePO4 alta tensión 20kWh Blunery.', priceUSD: 10528, flexPriceUSD: 8632.96, iva: 0.21, watts: null, capacityKwh: 20.0, brand: 'Blunery', cashDiscount: 0.15 },
  { id: 9202, category: 'bateria', name: 'Banco baterías alta tensión 35kWh Blunery', description: 'Banco baterías LiFePO4 alta tensión 35kWh Blunery.', priceUSD: 17143, flexPriceUSD: 14057.26, iva: 0.21, watts: null, capacityKwh: 35.0, brand: 'Blunery', cashDiscount: 0.15 },

  // === INVERSORES ON-GRID (IVA 21%) ===
  { id: 1176, category: 'inversor', name: 'Inversor Goodwe GW1500-NS (WiFi)', description: 'On Grid 1500W monofásico. WiFi incorporado.', priceUSD: 263, flexPriceUSD: null, iva: 0.21, watts: 1500, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 5726, category: 'inversor', name: 'Inversor Goodwe GW6000-SDT-20 (WiFi)', description: 'On Grid 6000W trifásico 380V. WiFi incorporado.', priceUSD: 893, flexPriceUSD: null, iva: 0.21, watts: 6000, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 4208, category: 'inversor', name: 'Inversor Growatt MIC1500TL-X', description: 'On Grid 1500W monofásico. WiFi optativo.', priceUSD: 280, flexPriceUSD: null, iva: 0.21, watts: 1500, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5988, category: 'inversor', name: 'Inversor Growatt MIN 3000TL-X2 (WiFi X)', description: 'On Grid 3000W monofásico. WiFi X incluido.', priceUSD: 385, flexPriceUSD: 315.70, iva: 0.21, watts: 3000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5992, category: 'inversor', name: 'Inversor Growatt MIN 5000TL-X2 (WiFi X)', description: 'On Grid 5000W monofásico. WiFi X incluido.', priceUSD: 626.90, flexPriceUSD: 514, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5993, category: 'inversor', name: 'Inversor Growatt MIN 6000TL-X2 (WiFi X)', description: 'On Grid 6000W monofásico. WiFi X incluido.', priceUSD: 644.80, flexPriceUSD: 528.70, iva: 0.21, watts: 6000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5897, category: 'inversor', name: 'Chint CPS SCA8KTL-SM/EU', description: 'On Grid 8000W monofásico.', priceUSD: 680, flexPriceUSD: null, iva: 0.21, watts: 8000, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5995, category: 'inversor', name: 'Inversor Growatt MOD5000TL3-X (WiFi X)', description: 'On Grid 5000W trifásico 380V. WiFi X incluido.', priceUSD: 920, flexPriceUSD: 754.40, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5996, category: 'inversor', name: 'Inversor Growatt MOD6000TL3-X (WiFi X)', description: 'On Grid 6000W trifásico 380V. WiFi X incluido.', priceUSD: 981.35, flexPriceUSD: 804.71, iva: 0.21, watts: 6000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5997, category: 'inversor', name: 'Inversor Growatt MOD8000TL3-X (WiFi X)', description: 'On Grid 8000W trifásico 380V. WiFi X incluido.', priceUSD: 1050, flexPriceUSD: 861, iva: 0.21, watts: 8000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5998, category: 'inversor', name: 'Inversor Growatt MOD10000TL3-X2 PRO (WiFi X)', description: 'On Grid 10000W trifásico 380V. WiFi X incluido.', priceUSD: 1125, flexPriceUSD: 922.10, iva: 0.21, watts: 10000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5999, category: 'inversor', name: 'Inversor Growatt MID 15KTL3-X (WiFi X)', description: 'On Grid 15000W trifásico 380V. WiFi X incluido.', priceUSD: 1339, flexPriceUSD: 1097.70, iva: 0.21, watts: 15000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5936, category: 'inversor', name: 'Inversor Growatt MID 20KTL3-X2 (promo)', description: 'On Grid 20000W trifásico 380V. Precio promocional.', priceUSD: 1190, flexPriceUSD: null, iva: 0.21, watts: 20000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6000, category: 'inversor', name: 'Inversor Growatt MID 20KTL3-X2 (WiFi X)', description: 'On Grid 20000W trifásico 380V. WiFi X incluido.', priceUSD: 1584, flexPriceUSD: 1298.50, iva: 0.21, watts: 20000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6001, category: 'inversor', name: 'Inversor Growatt MID 25KTL3-X2 (WiFi X)', description: 'On Grid 25000W trifásico 380V. WiFi X incluido.', priceUSD: 1872, flexPriceUSD: 1534.73, iva: 0.21, watts: 25000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6002, category: 'inversor', name: 'Inversor Growatt MID 30KTL3-X2 (WiFi X)', description: 'On Grid 30000W trifásico 380V. WiFi X incluido.', priceUSD: 1984, flexPriceUSD: 1626.86, iva: 0.21, watts: 30000, brand: 'Growatt', cashDiscount: 0 },
  { id: 6004, category: 'inversor', name: 'Inversor Growatt MAX50KTL3 LV AFCI (WiFi X)', description: 'On Grid 50000W trifásico 380V. AFCI, WiFi X incluido.', priceUSD: 2625, flexPriceUSD: 2152.88, iva: 0.21, watts: 50000, brand: 'Growatt', cashDiscount: 0 },
  { id: 5931, category: 'inversor', name: 'Inversor Growatt MAX60KTL3 LV (promo)', description: 'On Grid 60000W trifásico 380V. Precio promocional.', priceUSD: 2650, flexPriceUSD: null, iva: 0.21, watts: 60000, brand: 'Growatt', cashDiscount: 0 },
  { id: 6005, category: 'inversor', name: 'Inversor Growatt MAX60KTL3 LV AFCI (WiFi X)', description: 'On Grid 60000W trifásico 380V. AFCI, WiFi X incluido.', priceUSD: 2813, flexPriceUSD: 2306.66, iva: 0.21, watts: 60000, brand: 'Growatt', cashDiscount: 0 },
  { id: 6006, category: 'inversor', name: 'Inversor Growatt MAX80KTL3 LV AFCI (WiFi X)', description: 'On Grid 80000W trifásico 380V. AFCI, WiFi X incluido.', priceUSD: 2870, flexPriceUSD: 2353.40, iva: 0.21, watts: 80000, brand: 'Growatt', cashDiscount: 0 },
  { id: 6007, category: 'inversor', name: 'Inversor Growatt MAX100KTL3-X2 LV AFCI (WiFi X)', description: 'On Grid 100000W trifásico 380V. AFCI, WiFi X incluido.', priceUSD: 4018, flexPriceUSD: 3294.67, iva: 0.21, watts: 100000, brand: 'Growatt', cashDiscount: 0 },
  { id: 6034, category: 'inversor', name: 'Inversor Growatt MAX125KTL3-X2 LV AFCI (WiFi X)', description: 'On Grid 125000W trifásico 380V. AFCI, WiFi X incluido.', priceUSD: 4300, flexPriceUSD: 3526, iva: 0.21, watts: 125000, brand: 'Growatt', cashDiscount: 0 },
  { id: 5972, category: 'inversor', name: 'Chint SCA10K-T-EU', description: 'On Grid 10000W trifásico 380V.', priceUSD: 1159, flexPriceUSD: 950.62, iva: 0.21, watts: 10000, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5973, category: 'inversor', name: 'Chint SCA15K-T-EU', description: 'On Grid 15000W trifásico 380V.', priceUSD: 1380, flexPriceUSD: 1131.65, iva: 0.21, watts: 15000, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5974, category: 'inversor', name: 'Chint SCA20K-T-EU', description: 'On Grid 20000W trifásico 380V.', priceUSD: 1633, flexPriceUSD: 1338.66, iva: 0.21, watts: 20000, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5975, category: 'inversor', name: 'Chint SCA25K-T-EU', description: 'On Grid 25000W trifásico 380V.', priceUSD: 1930, flexPriceUSD: 1582.20, iva: 0.21, watts: 25000, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5976, category: 'inversor', name: 'Chint SCA30K-T-EU', description: 'On Grid 30000W trifásico 380V.', priceUSD: 2045, flexPriceUSD: 1677.18, iva: 0.21, watts: 30000, brand: 'Chint', cashDiscount: 0 },
  { id: 5978, category: 'inversor', name: 'Chint SCA50K-T-EU', description: 'On Grid 50000W trifásico 380V.', priceUSD: 2707, flexPriceUSD: 2219.46, iva: 0.21, watts: 50000, brand: 'Chint', cashDiscount: 0 },
  { id: 5979, category: 'inversor', name: 'Chint SCA60K-T-EU', description: 'On Grid 60000W trifásico 380V.', priceUSD: 2900, flexPriceUSD: 2378, iva: 0.21, watts: 60000, brand: 'Chint', cashDiscount: 0 },
  { id: 5981, category: 'inversor', name: 'Chint SCA100K-T-EU', description: 'On Grid 100000W trifásico 380V.', priceUSD: 4880, flexPriceUSD: 4001.60, iva: 0.21, watts: 100000, brand: 'Chint', cashDiscount: 0 },
  { id: 5982, category: 'inversor', name: 'Chint SCA125K-T-EU', description: 'On Grid 125000W trifásico 380V.', priceUSD: 5200, flexPriceUSD: 4264, iva: 0.21, watts: 125000, brand: 'Chint', cashDiscount: 0 },
  { id: 4677, category: 'inversor', name: 'Inversor Goodwe GW25K-MT (WiFi)', description: 'On Grid 25000W trifásico 380V. WiFi incorporado.', priceUSD: 2427.30, flexPriceUSD: 1990.40, iva: 0.21, watts: 25000, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 2852, category: 'inversor', name: 'Inversor Goodwe GW30K-MT (WiFi)', description: 'On Grid 30000W trifásico 380V. WiFi incorporado.', priceUSD: 2613.30, flexPriceUSD: 2142.90, iva: 0.21, watts: 30000, brand: 'Goodwe', cashDiscount: 0 },

  // === INVERSORES OFF-GRID (IVA 21%) ===
  { id: 6009, category: 'inversor-offgrid', name: 'Growatt SPF 3000TL HVM-48 (WiFi F)', description: 'Off Grid 3000W 48V. WiFi F incluido.', priceUSD: 414.90, flexPriceUSD: 340.20, iva: 0.21, watts: 3000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6010, category: 'inversor-offgrid', name: 'Growatt SPF 5000TL HVM-P (WiFi F)', description: 'Off Grid 5000W 48V. WiFi F incluido.', priceUSD: 577.10, flexPriceUSD: 473.20, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6134, category: 'inversor-offgrid', name: 'Growatt SPF 3500ES (WiFi F)', description: 'Off Grid 3500W. WiFi F incluido.', priceUSD: 460, flexPriceUSD: 377.20, iva: 0.21, watts: 3500, brand: 'Growatt', cashDiscount: 0 },

  // === INVERSORES HIBRIDOS (IVA variable) ===
  { id: 4988, category: 'inversor-hibrido', name: 'Goodwe GW8K-ET Híbrido c/Wifi', description: 'Híbrido 8000W trifásico 380V. WiFi incorporado.', priceUSD: 1850, flexPriceUSD: null, iva: 0.21, watts: 8000, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 5349, category: 'inversor-hibrido', name: 'Goodwe GW10K-ET Híbrido c/Wifi', description: 'Híbrido 10000W trifásico 380V. WiFi incorporado.', priceUSD: 1930, flexPriceUSD: null, iva: 0.105, watts: 10000, brand: 'Goodwe', cashDiscount: 0.15 },

  // === INYECCION CERO / MONITORING (IVA variable) ===
  { id: 5983, category: 'monitoring', name: 'Chint SE-FC2-E with EPM kit', description: 'Kit inyección cero Chint con EPM.', priceUSD: 720.60, flexPriceUSD: 590.90, iva: 0.21, watts: null, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5985, category: 'monitoring', name: 'Chint DTSU666 limitador iny cero trif', description: 'Limitador inyección cero trifásico Chint.', priceUSD: 178.20, flexPriceUSD: 146.10, iva: 0.21, watts: null, brand: 'Chint', cashDiscount: 0.15 },
  { id: 5986, category: 'monitoring', name: 'Chint CT 300 pack 3 unidades', description: 'Pack 3 transformadores de corriente 300A.', priceUSD: 84.40, flexPriceUSD: 69.20, iva: 0.21, watts: null, brand: 'Chint', cashDiscount: 0.15 },
  { id: 4092, category: 'monitoring', name: 'KIT Inyección Cero Goodwe Monofásico sin CT', description: 'Kit inyección cero Goodwe monofásico, sin CT.', priceUSD: 168, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 4047, category: 'monitoring', name: 'CT90-30 Goodwe monofásico', description: 'Transformador de corriente 90-30 Goodwe monofásico.', priceUSD: 70, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 4137, category: 'monitoring', name: 'CT 250 (250A:5A)', description: 'Transformador de corriente 250A:5A.', priceUSD: 80, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 4097, category: 'monitoring', name: 'KIT Inyección Cero Goodwe Monofásico con CT', description: 'Kit inyección cero Goodwe monofásico, con CT incluido.', priceUSD: 82, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Goodwe', cashDiscount: 0.15 },
  { id: 5042, category: 'monitoring', name: 'TPM Growatt trifásico', description: 'Medidor TPM Growatt trifásico.', priceUSD: 138.70, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5491, category: 'monitoring', name: 'Growatt TPM-CT-E 250A trif', description: 'Medidor TPM con CT 250A trifásico Growatt.', priceUSD: 217.20, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5492, category: 'monitoring', name: 'Growatt Smart Energy Manager 300K', description: 'Smart Energy Manager 300kW Growatt.', priceUSD: 730.40, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5852, category: 'monitoring', name: 'Growatt Smart Energy Manager 600K', description: 'Smart Energy Manager 600kW Growatt.', priceUSD: 1340.80, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5809, category: 'monitoring', name: 'Growatt Smart Energy Manager 1MW', description: 'Smart Energy Manager 1MW Growatt.', priceUSD: 1555.10, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 6021, category: 'monitoring', name: 'Growatt Smart Energy Manager 2MW', description: 'Smart Energy Manager 2MW Growatt.', priceUSD: 1580.70, flexPriceUSD: null, iva: 0.105, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5939, category: 'monitoring', name: 'Powermeter Solar NP80', description: 'Powermeter Solar NP80.', priceUSD: 340, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 5907, category: 'monitoring', name: 'Powermeter Solar NP600SN', description: 'Powermeter Solar NP600SN.', priceUSD: 424, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },

  // === MODULOS WIFI (IVA 21%) ===
  { id: 4258, category: 'wifi', name: 'WiFi Module Growatt ShineWiFi-F', description: 'Módulo WiFi Growatt ShineWiFi-F.', priceUSD: 38.80, flexPriceUSD: 31.80, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 4257, category: 'wifi', name: 'WiFi Module Growatt ShineWiFi-X', description: 'Módulo WiFi Growatt ShineWiFi-X.', priceUSD: 33.80, flexPriceUSD: 27.70, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5467, category: 'wifi', name: 'Modulo LAN Growatt ShineLAN-X', description: 'Módulo LAN Growatt ShineLAN-X.', priceUSD: 33.80, flexPriceUSD: 27.70, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5080, category: 'wifi', name: 'Módulo Shine WiFi-F c/extensión USB', description: 'Módulo WiFi-F Growatt con cable extensión USB.', priceUSD: 37, flexPriceUSD: 30.30, iva: 0.21, watts: null, brand: 'Growatt', cashDiscount: 0.15 },
  { id: 5347, category: 'wifi', name: 'Módulo Wifi Goodwe gen 2', description: 'Módulo WiFi Goodwe generación 2.', priceUSD: 95, flexPriceUSD: 77.90, iva: 0.21, watts: null, brand: 'Goodwe', cashDiscount: 0.15 },

  // === CAJAS DE PROTECCION CA (CABOX) (IVA 21%) ===
  { id: 3559, category: 'proteccion', name: 'CABOX plás. Offgrid mono 3-3.5kW SPF', description: 'Caja protección CA plástica Offgrid mono 3-3.5kW SPF.', priceUSD: 105.43, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 1255, category: 'proteccion', name: 'CABOX plás. Offgrid mono 5kW SPF', description: 'Caja protección CA plástica Offgrid mono 5kW SPF.', priceUSD: 102.24, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5877, category: 'proteccion', name: 'CABOX plás. Offgrid mono 6kW SPF', description: 'Caja protección CA plástica Offgrid mono 6kW SPF.', priceUSD: 188.40, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 4389, category: 'proteccion', name: 'CABOX plás. Ongrid mono hasta 2kW c/SPD', description: 'Caja protección CA plástica Ongrid mono hasta 2kW con SPD.', priceUSD: 239.69, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 4390, category: 'proteccion', name: 'CABOX plás. Ongrid mono 2.5-3kW c/SPD', description: 'Caja protección CA plástica Ongrid mono 2.5-3kW con SPD.', priceUSD: 237.03, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6040, category: 'proteccion', name: 'CABOX plás. Ongrid mono 2.5-4.6kW c/SPD', description: 'Caja protección CA plástica Ongrid mono 2.5-4.6kW con SPD.', priceUSD: 191.90, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5744, category: 'proteccion', name: 'CABOX plás. Ongrid mono 5-6kW c/SPD', description: 'Caja protección CA plástica Ongrid mono 5-6kW con SPD.', priceUSD: 196.16, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5769, category: 'proteccion', name: 'CABOX plás. Ongrid trif 5-6kW c/SPD', description: 'Caja protección CA plástica Ongrid trif 5-6kW con SPD.', priceUSD: 340.84, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5745, category: 'proteccion', name: 'CABOX plás. Ongrid trif 5-6kW sin SPD', description: 'Caja protección CA plástica Ongrid trif 5-6kW sin SPD.', priceUSD: 191.49, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5746, category: 'proteccion', name: 'CABOX plás. Ongrid trif 8-10kW sin SPD', description: 'Caja protección CA plástica Ongrid trif 8-10kW sin SPD.', priceUSD: 195.78, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5747, category: 'proteccion', name: 'CABOX met. Ongrid trif 12-15kW sin SPD', description: 'Caja protección CA metálica Ongrid trif 12-15kW sin SPD.', priceUSD: 438.95, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 4705, category: 'proteccion', name: 'CABOX met. Ongrid trif 20-25kW sin SPD', description: 'Caja protección CA metálica Ongrid trif 20-25kW sin SPD.', priceUSD: 492.82, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 5251, category: 'proteccion', name: 'CABOX met. Ongrid trif 30kW sin SPD', description: 'Caja protección CA metálica Ongrid trif 30kW sin SPD.', priceUSD: 511.19, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6098, category: 'proteccion', name: 'CABOX met. Híbrida mono 5-8kW c/SPD Red+bypass', description: 'Caja protección CA metálica Híbrida mono 5-8kW con SPD, Red+bypass.', priceUSD: 321.25, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6097, category: 'proteccion', name: 'CABOX met. Híbrida mono 5-8kW c/SPD Red+Grupo+bypass', description: 'Caja protección CA metálica Híbrida mono 5-8kW con SPD, Red+Grupo+bypass.', priceUSD: 362, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6081, category: 'proteccion', name: 'CABOX met. Híbrida trif 10-15kW Red o Grupo', description: 'Caja protección CA metálica Híbrida trif 10-15kW Red o Grupo.', priceUSD: 740.87, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6080, category: 'proteccion', name: 'CABOX met. Híbrida trif 10-15kW Red+Grupo+bypass', description: 'Caja protección CA metálica Híbrida trif 10-15kW Red+Grupo+bypass.', priceUSD: 941.19, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },
  { id: 6082, category: 'proteccion', name: 'CABOX met. Híbrida trif paralelo 20-30kW', description: 'Caja protección CA metálica Híbrida trif paralelo 20-30kW.', priceUSD: 1198.12, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CABOX', cashDiscount: 0 },

  // === CAJAS DE PROTECCION CC (CCBOX) (IVA 21%) ===
  { id: 3589, category: 'proteccion', name: 'CCBOX plás. 1TM1x125A 1TM2x50A', description: 'Caja protección CC plástica 1TM1x125A 1TM2x50A.', priceUSD: 106.30, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6059, category: 'proteccion', name: 'CCBOX plás. 1TM1x125A 1TM2x50A Bornera', description: 'Caja protección CC plástica 1TM1x125A 1TM2x50A con bornera.', priceUSD: 84.52, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6083, category: 'proteccion', name: 'CCBOX plás. 2 strings 4fus25A sin SPD', description: 'Caja protección CC plástica 2 strings 4 fusibles 25A sin SPD.', priceUSD: 67.07, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5932, category: 'proteccion', name: 'CCBOX plás. 1SEC_bat 2TM2x16A', description: 'Caja protección CC plástica 1 seccionador batería 2TM2x16A.', priceUSD: 210.16, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 4392, category: 'proteccion', name: 'CCBOX plás. 1 string 1TM2x16A c/SPD', description: 'Caja protección CC plástica 1 string 1TM2x16A con SPD.', priceUSD: 107.76, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5748, category: 'proteccion', name: 'CCBOX plás. 2 strings 2TM2x16A sin SPD', description: 'Caja protección CC plástica 2 strings 2TM2x16A sin SPD.', priceUSD: 101.85, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5749, category: 'proteccion', name: 'CCBOX met. 3 strings 6fus15A sin SPD', description: 'Caja protección CC metálica 3 strings 6 fusibles 15A sin SPD.', priceUSD: 157.93, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 4665, category: 'proteccion', name: 'CCBOX met. 3 strings 6fus15A c/SPD', description: 'Caja protección CC metálica 3 strings 6 fusibles 15A con SPD.', priceUSD: 335.34, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 4692, category: 'proteccion', name: 'CCBOX met. 4 strings 8fus15A sin SPD', description: 'Caja protección CC metálica 4 strings 8 fusibles 15A sin SPD.', priceUSD: 194.94, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5900, category: 'proteccion', name: 'CCBOX met. 4 strings 8fus15A c/SPD', description: 'Caja protección CC metálica 4 strings 8 fusibles 15A con SPD.', priceUSD: 535.48, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5750, category: 'proteccion', name: 'CCBOX met. 5 strings 10fus15A sin SPD', description: 'Caja protección CC metálica 5 strings 10 fusibles 15A sin SPD.', priceUSD: 315.70, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 4694, category: 'proteccion', name: 'CCBOX met. 6 strings 12fus15A sin SPD', description: 'Caja protección CC metálica 6 strings 12 fusibles 15A sin SPD.', priceUSD: 348.30, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5551, category: 'proteccion', name: 'CCBOX met. 8 strings 16fus15A sin SPD', description: 'Caja protección CC metálica 8 strings 16 fusibles 15A sin SPD.', priceUSD: 337.40, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5879, category: 'proteccion', name: 'CCBOX met. 3 strings 6fus25A sin SPD', description: 'Caja protección CC metálica 3 strings 6 fusibles 25A sin SPD.', priceUSD: 159.66, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5899, category: 'proteccion', name: 'CCBOX met. 3 strings 6fus25A c/SPD', description: 'Caja protección CC metálica 3 strings 6 fusibles 25A con SPD.', priceUSD: 332.05, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5794, category: 'proteccion', name: 'CCBOX met. 4 strings 8fus25A sin SPD', description: 'Caja protección CC metálica 4 strings 8 fusibles 25A sin SPD.', priceUSD: 197.90, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5901, category: 'proteccion', name: 'CCBOX met. 4 strings 8fus25A c/SPD', description: 'Caja protección CC metálica 4 strings 8 fusibles 25A con SPD.', priceUSD: 532.77, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5795, category: 'proteccion', name: 'CCBOX met. 5 strings 10fus25A sin SPD', description: 'Caja protección CC metálica 5 strings 10 fusibles 25A sin SPD.', priceUSD: 316.48, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5796, category: 'proteccion', name: 'CCBOX met. 6 strings 12fus25A sin SPD', description: 'Caja protección CC metálica 6 strings 12 fusibles 25A sin SPD.', priceUSD: 361.43, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5797, category: 'proteccion', name: 'CCBOX met. 8 strings 16fus25A sin SPD', description: 'Caja protección CC metálica 8 strings 16 fusibles 25A sin SPD.', priceUSD: 382.80, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6088, category: 'proteccion', name: 'CCBOX met. 12 strings 24fus25A sin SPD', description: 'Caja protección CC metálica 12 strings 24 fusibles 25A sin SPD.', priceUSD: 643.34, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6089, category: 'proteccion', name: 'CCBOX met. 16 strings 32fus25A sin SPD', description: 'Caja protección CC metálica 16 strings 32 fusibles 25A sin SPD.', priceUSD: 739.76, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6084, category: 'proteccion', name: 'CCBOX met. 4TM1x125A bat', description: 'Caja protección CC metálica 4TM1x125A batería.', priceUSD: 360.43, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 6064, category: 'proteccion', name: 'Kit Cable 35mm2 2m ojales', description: 'Kit cable 35mm2 2 metros con ojales.', priceUSD: 92.49, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },
  { id: 5100, category: 'proteccion', name: 'Cable datos BMS 1m', description: 'Cable datos BMS 1 metro.', priceUSD: 10, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'CCBOX', cashDiscount: 0 },

  // === RAPID SHUTDOWN (IVA 21%) ===
  { id: 5873, category: 'proteccion', name: 'Rapid Shutdown S-RSD150-40-4', description: 'Rapid Shutdown 4 strings S-RSD150-40-4.', priceUSD: 323.22, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0 },
  { id: 5874, category: 'proteccion', name: 'Rapid Shutdown S-RSD150-40-6', description: 'Rapid Shutdown 6 strings S-RSD150-40-6.', priceUSD: 434.21, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0 },

  // === ESTRUCTURAS MULTIMONT (IVA 21%) ===
  { id: 4040, category: 'estructura', name: 'MULTIMONT-1 V 60 celdas', description: 'Estructura Multimont 1 panel vertical 60 celdas.', priceUSD: 56.79, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 3998, category: 'estructura', name: 'MULTIMONT-2 V 60 celdas', description: 'Estructura Multimont 2 paneles vertical 60 celdas.', priceUSD: 68.45, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 1221, category: 'estructura', name: 'MULTIMONT-3 V 60 celdas', description: 'Estructura Multimont 3 paneles vertical 60 celdas.', priceUSD: 102.35, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 4039, category: 'estructura', name: 'MULTIMONT-1 V 72 celdas', description: 'Estructura Multimont 1 panel vertical 72 celdas.', priceUSD: 63.11, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 4041, category: 'estructura', name: 'MULTIMONT-2 V 72 celdas', description: 'Estructura Multimont 2 paneles vertical 72 celdas.', priceUSD: 74.76, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 4042, category: 'estructura', name: 'MULTIMONT-3 V 72 celdas', description: 'Estructura Multimont 3 paneles vertical 72 celdas.', priceUSD: 111.82, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 1220, category: 'estructura', name: 'MULTIMONT-2 H 60/72 celdas', description: 'Estructura Multimont 2 paneles horizontal 60/72 celdas.', priceUSD: 63.75, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 1374, category: 'estructura', name: 'MULTIMONT-1 H 60/72 celdas', description: 'Estructura Multimont 1 panel horizontal 60/72 celdas.', priceUSD: 23.69, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 3999, category: 'estructura', name: 'MULTIMONT-CONECTORES', description: 'Conectores para estructura Multimont.', priceUSD: 5.44, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 2203, category: 'estructura', name: 'MULTIMONT-1 H 36 celdas', description: 'Estructura Multimont 1 panel horizontal 36 celdas.', priceUSD: 31.78, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 2204, category: 'estructura', name: 'MULTIMONT-2 H 36 celdas', description: 'Estructura Multimont 2 paneles horizontal 36 celdas.', priceUSD: 76.07, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },
  { id: 1268, category: 'estructura', name: 'Nivelador techo acanalado 2 perfiles', description: 'Nivelador para techo acanalado, 2 perfiles.', priceUSD: 51.71, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Multimont', cashDiscount: 0 },

  // === ESTRUCTURAS CSOLAR (IVA 21%) ===
  { id: 6026, category: 'estructura', name: 'Csolar Kit CS-PDA coplanar sinusoidal 220mm', description: 'Kit coplanar sinusoidal 220mm Csolar.', priceUSD: 12.56, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6027, category: 'estructura', name: 'Csolar Kit CS-PDA coplanar trapezoidal 550mm', description: 'Kit coplanar trapezoidal 550mm Csolar.', priceUSD: 22.24, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6028, category: 'estructura', name: 'Csolar Kit CS-KCSON coplanar trapezoidal 300mm', description: 'Kit coplanar trapezoidal 300mm Csolar.', priceUSD: 12.29, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6094, category: 'estructura', name: 'Csolar cinta butilo PDA 12m', description: 'Cinta butilo PDA 12 metros Csolar.', priceUSD: 16.60, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6076, category: 'estructura', name: 'Csolar KECRA-10 rotura anodizado 10pcs', description: 'Kit rotura puente térmico anodizado 10 piezas Csolar.', priceUSD: 2.18, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6077, category: 'estructura', name: 'Csolar KECRA-500 rotura anodizado 500pcs', description: 'Kit rotura puente térmico anodizado 500 piezas Csolar.', priceUSD: 86.39, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6099, category: 'estructura', name: 'Csolar PT-4 conexión tierra x4', description: 'Kit conexión a tierra 4 unidades Csolar.', priceUSD: 7.38, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6100, category: 'estructura', name: 'Csolar PT-15 conexión tierra x15', description: 'Kit conexión a tierra 15 unidades Csolar.', priceUSD: 25.92, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6090, category: 'estructura', name: 'Csolar KCSI-II1 inclinado 15-30° 4 paneles', description: 'Estructura inclinada 15-30° para 4 paneles Csolar.', priceUSD: 232.08, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 6091, category: 'estructura', name: 'Csolar KSA-CONT-PLZ coplanar 4 paneles', description: 'Estructura coplanar para 4 paneles Csolar.', priceUSD: 119.78, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5751, category: 'estructura', name: 'KBB2.0-M30 Kit Bridas Base 2 paneles 30mm', description: 'Kit bridas base para 2 paneles, 30mm.', priceUSD: 10.95, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5752, category: 'estructura', name: 'KAMB1.0-M30 Kit Ampliación 1 panel 30mm', description: 'Kit ampliación para 1 panel, 30mm.', priceUSD: 3.93, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5015, category: 'estructura', name: 'KBB2.0-M35 Kit Bridas Base 2 paneles 35mm', description: 'Kit bridas base para 2 paneles, 35mm.', priceUSD: 11.01, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5017, category: 'estructura', name: 'KAMB1.0-M35 Kit Ampliación 1 panel 35mm', description: 'Kit ampliación para 1 panel, 35mm.', priceUSD: 3.95, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5014, category: 'estructura', name: 'KBB2.0-M40 Kit Bridas Base 2 paneles 40mm', description: 'Kit bridas base para 2 paneles, 40mm.', priceUSD: 11.10, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5016, category: 'estructura', name: 'KAMB1.0-M40 Kit Ampliación 1 panel 40mm', description: 'Kit ampliación para 1 panel, 40mm.', priceUSD: 3.98, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5018, category: 'estructura', name: 'KIT Fijación correa metálica', description: 'Kit fijación para correa metálica.', priceUSD: 21.65, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5019, category: 'estructura', name: 'KIT Fijación directa chapa trapezoidal', description: 'Kit fijación directa para chapa trapezoidal.', priceUSD: 9.57, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5753, category: 'estructura', name: 'Kit perfil base KFP-660', description: 'Kit perfil base KFP-660.', priceUSD: 18.10, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5027, category: 'estructura', name: 'Kit fijación chapa emballetada', description: 'Kit fijación para chapa emballetada.', priceUSD: 11.80, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5120, category: 'estructura', name: 'Gancho salvateja', description: 'Gancho salvateja para montaje en teja.', priceUSD: 13.65, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },
  { id: 5505, category: 'estructura', name: 'Kit riostras triángulo CSI 10 paneles', description: 'Kit riostras triángulo CSI para 10 paneles.', priceUSD: 23.09, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Csolar', cashDiscount: 0 },

  // === TERMOTANQUES SOLARES (IVA 21%) ===
  { id: 9101, category: 'termotanque', name: 'Termotanque Solar 150L Tubo Vacío Galvanizado', description: 'Termosifónico 150L 15 tubos con estructura y ánodo.', priceUSD: 208, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 9102, category: 'termotanque', name: 'Termotanque Solar 200L Tubo Vacío Galvanizado', description: 'Termosifónico 200L 20 tubos con estructura y ánodo.', priceUSD: 280, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1106, category: 'termotanque', name: 'Centralita control Temp TK7Y', description: 'Centralita control de temperatura TK7Y.', priceUSD: 38, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1903, category: 'termotanque', name: 'Centralita control Temp ENERGY TK8A', description: 'Centralita control de temperatura ENERGY TK8A.', priceUSD: 63, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 4966, category: 'termotanque', name: 'Smart Switch', description: 'Smart Switch para termotanque solar.', priceUSD: 43, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 4967, category: 'termotanque', name: 'Smart Switch & Temp WiFi', description: 'Smart Switch con sensor de temperatura WiFi.', priceUSD: 280, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 9107, category: 'termotanque', name: 'Maqueta Mini Termotanque Heat Pipe', description: 'Maqueta mini termotanque Heat Pipe para exhibición.', priceUSD: 120, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 9108, category: 'termotanque', name: 'Maqueta Mini Termotanque Placa Plana', description: 'Maqueta mini termotanque Placa Plana para exhibición.', priceUSD: 100, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5563, category: 'termotanque', name: 'Pack x10 oring silicona tubo 58mm', description: 'Pack 10 orings silicona para tubo 58mm.', priceUSD: 9.42, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5564, category: 'termotanque', name: 'Pack x10 guardapolvo tubo vacío 58mm', description: 'Pack 10 guardapolvos para tubo vacío 58mm.', priceUSD: 27, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5565, category: 'termotanque', name: 'Pack x10 soporte plástico termotanque', description: 'Pack 10 soportes plásticos para termotanque.', priceUSD: 9.42, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5576, category: 'termotanque', name: 'Pack x10 soporte plástico Heatpipe', description: 'Pack 10 soportes plásticos Heatpipe.', priceUSD: 111.51, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 2592, category: 'termotanque', name: 'Ánodo Magnesio 300mm RM 3/4', description: 'Ánodo de magnesio 300mm rosca macho 3/4.', priceUSD: 8.05, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1173, category: 'termotanque', name: 'Ánodo Magnesio 200x17mm', description: 'Ánodo de magnesio 200x17mm.', priceUSD: 6.69, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1712, category: 'termotanque', name: 'Resistencia 1500W 1-1/4 c/Termostato', description: 'Resistencia eléctrica 1500W 1-1/4 con termostato.', priceUSD: 20.01, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 2661, category: 'termotanque', name: 'Resistencia 2000W 1-1/4 c/Termostato', description: 'Resistencia eléctrica 2000W 1-1/4 con termostato.', priceUSD: 21.50, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1228, category: 'termotanque', name: 'Kit Resistencia Eléctrica p/Termotanque', description: 'Kit completo resistencia eléctrica para termotanque solar.', priceUSD: 120.09, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1239, category: 'termotanque', name: 'Vaina porta sensor 100mm 1/2', description: 'Vaina porta sensor 100mm rosca 1/2.', priceUSD: 9.77, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5007, category: 'termotanque', name: 'Tapa Plástica Cubre Resistencia', description: 'Tapa plástica cubre resistencia para termotanque.', priceUSD: 2.23, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1229, category: 'termotanque', name: 'Tanque Prellenado 5L', description: 'Tanque prellenado 5 litros.', priceUSD: 31.86, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1683, category: 'termotanque', name: 'Válvula Retención vertical 3/4', description: 'Válvula retención vertical 3/4.', priceUSD: 5.59, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 1891, category: 'termotanque', name: 'Válvula termostática 3 vías DN20', description: 'Válvula termostática 3 vías DN20.', priceUSD: 34.10, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 2405, category: 'termotanque', name: 'Válvula Seguridad T/P 3/4 3bar', description: 'Válvula de seguridad temperatura/presión 3/4 3bar.', priceUSD: 20.10, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },
  { id: 5363, category: 'termotanque', name: 'Soporte venteo termotanque', description: 'Soporte venteo para termotanque solar.', priceUSD: 4.13, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'SolarNav', cashDiscount: 0.15 },

  // === POWERMETER SENSORS (IVA 21%) ===
  { id: 6166, category: 'powermeter', name: 'Powermeter Solar SN sin sensores', description: 'Powermeter Solar SN sin sensores.', priceUSD: 86, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6167, category: 'powermeter', name: 'Powermeter Solar Smart PRO5', description: 'Powermeter Solar Smart PRO5.', priceUSD: 545, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6168, category: 'powermeter', name: 'Powermeter Solar Smart PRO15', description: 'Powermeter Solar Smart PRO15.', priceUSD: 846, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6169, category: 'powermeter', name: 'Powermeter cable extensor 5m', description: 'Cable extensor 5 metros para Powermeter.', priceUSD: 27, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6170, category: 'powermeter', name: 'Powermeter Powermate cloud', description: 'Powermeter Powermate cloud.', priceUSD: 188, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6171, category: 'powermeter', name: 'Powermeter Sensor NP80 hasta 80A', description: 'Sensor NP80 hasta 80A para Powermeter.', priceUSD: 22, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6172, category: 'powermeter', name: 'Powermeter Sensor NP150 hasta 150A', description: 'Sensor NP150 hasta 150A para Powermeter.', priceUSD: 36, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6173, category: 'powermeter', name: 'Powermeter Sensor NP600 hasta 600A', description: 'Sensor NP600 hasta 600A para Powermeter.', priceUSD: 88, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6174, category: 'powermeter', name: 'Powermeter Sensor NP1500 hasta 1500A', description: 'Sensor NP1500 hasta 1500A para Powermeter.', priceUSD: 130, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6175, category: 'powermeter', name: 'Powermeter Sensor NP3000 hasta 3000A', description: 'Sensor NP3000 hasta 3000A para Powermeter.', priceUSD: 173, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6176, category: 'powermeter', name: 'Powermeter Sensor NP1600 barra', description: 'Sensor NP1600 tipo barra para Powermeter.', priceUSD: 170, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6177, category: 'powermeter', name: 'Powermeter Sensor NP2500 barra', description: 'Sensor NP2500 tipo barra para Powermeter.', priceUSD: 332, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6178, category: 'powermeter', name: 'Powermeter Sensor NP/5 5A', description: 'Sensor NP/5 5A para Powermeter.', priceUSD: 60, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6179, category: 'powermeter', name: 'Powermeter sensor NC/5 5A', description: 'Sensor NC/5 5A para Powermeter.', priceUSD: 25, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6180, category: 'powermeter', name: 'Powermeter sensor NP600WP waterproof', description: 'Sensor NP600WP waterproof para Powermeter.', priceUSD: 416, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6181, category: 'powermeter', name: 'Powermeter sensor RG36 Rogowski 1000A', description: 'Sensor RG36 Rogowski 1000A para Powermeter.', priceUSD: 115, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6182, category: 'powermeter', name: 'Powermeter sensor RG100 Rogowski 4000A', description: 'Sensor RG100 Rogowski 4000A para Powermeter.', priceUSD: 246, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },
  { id: 6183, category: 'powermeter', name: 'Powermeter sensor RG200 Rogowski 6000A', description: 'Sensor RG200 Rogowski 6000A para Powermeter.', priceUSD: 366, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Powermeter Solar', cashDiscount: 0 },

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
