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
  panelDegradation: 0.005,     // 0.5%/año degradación paneles
  whatsappNumber: '5491155881126',
  installMultipliers: { ongrid: 1.0, hybrid: 1.35, offgrid: 1.50 },

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

// Productos — se pueden agregar/editar desde admin
const DEFAULT_PRODUCTS = [

  // === PANEL SOLAR (IVA 10.5%) ===
  { id: 7001, category: 'panel', sku: 'JKM550M72HL4V30', name: 'Panel Solar 550W Jinko Mono Perc Tiger Pro', description: 'Monocristalino 550Wp. 144 celdas, cable 1200mm, marco 30mm. 36 por pallet.', priceUSD: 118, flexPriceUSD: null, iva: 0.105, watts: 550, brand: 'Jinko', cashDiscount: 0 },

  // === BATERÍAS LITIO (IVA 21%) ===
  { id: 7010, category: 'bateria', sku: 'UF5000', name: 'Batería Pylontech US5000 LiFePO4 5.12kWh', description: 'Fosfato de Ion-Litio 51.2V 5120Wh. Hasta 20 en paralelo. 6000 ciclos DOD 95%. 10 años garantía.', priceUSD: 1149, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Pylontech', cashDiscount: 0, capacityKwh: 5.12, maxDischargeW: 5000 },

  // === INVERSORES OFF-GRID (IVA 21%) ===
  { id: 7020, category: 'inversor-offgrid', sku: 'SPF3000TLHVM-48', name: 'Growatt SPF3000 Off-Grid 3kW', description: 'Off-Grid 1 MPPT 3000VA 48V/220V. No paralelizable. Incluye Dongle WIFI-F. 2 años garantía.', priceUSD: 389, flexPriceUSD: null, iva: 0.21, watts: 3000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7021, category: 'inversor-offgrid', sku: 'SPF3500ES', name: 'Growatt SPF3500ES Off-Grid 3.5kW', description: 'Off-Grid 1 MPPT 3500VA 48V/220V. Hasta 6 en paralelo, red trifásica. Función SUB (red+FV). Incluye Dongle WIFI-F. 2 años garantía.', priceUSD: 490, flexPriceUSD: null, iva: 0.21, watts: 3500, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7022, category: 'inversor-offgrid', sku: 'SPF5000ES', name: 'Growatt SPF5000ES Off-Grid 5kW', description: 'Off-Grid 1 MPPT 5000VA 48V/220V. Hasta 6 en paralelo, red trifásica. Función SUB. Incluye Dongle WIFI-F. 2 años garantía.', priceUSD: 488, flexPriceUSD: null, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7023, category: 'inversor-offgrid', sku: 'SPF6000ES Plus', name: 'Growatt SPF6000ES Plus Off-Grid 6kW', description: 'Off-Grid 2 MPPT 6000VA 48V/220V. Hasta 6 en paralelo, red trifásica. Función SUB. Incluye Dongle WIFI-F. 2 años garantía.', priceUSD: 526, flexPriceUSD: null, iva: 0.21, watts: 6000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },

  // === INVERSORES HÍBRIDOS 220V - MONOFÁSICOS (IVA 21%) ===
  { id: 7030, category: 'inversor-hibrido', sku: 'SUN-3.6K-SG03LP1-EU', name: 'Deye SUN-3.6K Híbrido Mono 3.6kW', description: 'Híbrido monofásico 3.6kW IP65. Hasta 16 en paralelo. 2 MPPT. Baterías 48V. Picos 12000W/10s. Wifi + limitador inyección. 5 años garantía.', priceUSD: 1250, flexPriceUSD: null, iva: 0.21, watts: 3600, brand: 'Deye', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7031, category: 'inversor-hibrido', sku: 'SUN-5K-SG05LP1-EU-AM2-P', name: 'Deye SUN-5K Híbrido Mono 5kW', description: 'Híbrido monofásico 5kW IP65. Hasta 16 en paralelo. 2 MPPT. Baterías 48V. Picos 12000W/10s. Wifi + limitador inyección. 5 años garantía.', priceUSD: 1252, flexPriceUSD: null, iva: 0.21, watts: 5000, brand: 'Deye', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7032, category: 'inversor-hibrido', sku: 'SUN-6K-SG05LP1-EU-AM2-P', name: 'Deye SUN-6K Híbrido Mono 6kW', description: 'Híbrido monofásico 6kW IP65. Hasta 16 en paralelo. 2 MPPT. Baterías 48V. Picos 12000W/10s. Wifi + limitador inyección. 5 años garantía.', priceUSD: 1252, flexPriceUSD: null, iva: 0.21, watts: 6000, brand: 'Deye', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7033, category: 'inversor-hibrido', sku: 'SUN-8K-SG05LP1-EU-SM2-P', name: 'Deye SUN-8K Híbrido Mono 8kW', description: 'Híbrido monofásico 8kW IP65. Hasta 16 en paralelo. 2 MPPT. Baterías 48V. Picos 16000W/10s. Wifi + limitador inyección. 5 años garantía.', priceUSD: 1532, flexPriceUSD: null, iva: 0.21, watts: 8000, brand: 'Deye', cashDiscount: 0, phase: 'mono', voltage: 220 },

  // === INVERSORES HÍBRIDOS 380V - TRIFÁSICOS (IVA 21%) ===
  { id: 7040, category: 'inversor-hibrido', sku: 'SUN-8K-SG05LP3-EU-SM2', name: 'Deye SUN-8K Híbrido Tri 8kW', description: 'Híbrido trifásico 8kW IP65. Hasta 10 en paralelo. 2 MPPT. Baterías 48V. Salida trifásica desbalanceada. Wifi + limitador inyección. 5 años garantía.', priceUSD: 2164, flexPriceUSD: null, iva: 0.21, watts: 8000, brand: 'Deye', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7041, category: 'inversor-hibrido', sku: 'SUN-10K-SG05LP3-EU-SM2', name: 'Deye SUN-10K Híbrido Tri 10kW', description: 'Híbrido trifásico 10kW IP65. Hasta 10 en paralelo. 2 MPPT. Baterías 48V. Salida trifásica desbalanceada. Wifi + limitador inyección. 5 años garantía.', priceUSD: 2309, flexPriceUSD: null, iva: 0.21, watts: 10000, brand: 'Deye', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7042, category: 'inversor-hibrido', sku: 'SUN-12K-SG05LP3-EU-SM2', name: 'Deye SUN-12K Híbrido Tri 12kW', description: 'Híbrido trifásico 12kW IP65. Hasta 10 en paralelo. 2 MPPT. Baterías 48V. Salida trifásica desbalanceada. Wifi + limitador inyección. 5 años garantía.', priceUSD: 2428, flexPriceUSD: null, iva: 0.21, watts: 12000, brand: 'Deye', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7043, category: 'inversor-hibrido', sku: 'SUN-15K-SG05LP3-EU-SM2', name: 'Deye SUN-15K Híbrido Tri 15kW', description: 'Híbrido trifásico 15kW IP65. Hasta 10 en paralelo. 2 MPPT. Baterías 48V. Salida trifásica desbalanceada. Wifi + limitador inyección. 5 años garantía.', priceUSD: 2694, flexPriceUSD: null, iva: 0.21, watts: 15000, brand: 'Deye', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7044, category: 'inversor-hibrido', sku: 'SUN-20K-SG05LP3-EU-SM2', name: 'Deye SUN-20K Híbrido Tri 20kW', description: 'Híbrido trifásico 20kW IP65. Hasta 10 en paralelo. 2 MPPT. Baterías 48V. Salida trifásica desbalanceada. Wifi + limitador inyección. 5 años garantía.', priceUSD: 3658, flexPriceUSD: null, iva: 0.21, watts: 20000, brand: 'Deye', cashDiscount: 0, phase: 'tri', voltage: 380 },

  // === INVERSORES ON-GRID 220V - MONOFÁSICOS (IVA 21%) ===
  { id: 7050, category: 'inversor', sku: 'MIC3000TL-X2', name: 'Growatt MIC3000 On-Grid Mono 3kW', description: 'On-Grid monofásico 1 MPPT 3000W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 371, flexPriceUSD: null, iva: 0.21, watts: 3000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7051, category: 'inversor', sku: 'MIN3600TL-X2', name: 'Growatt MIN3600 On-Grid Mono 3.6kW', description: 'On-Grid monofásico 2 MPPT 3600W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 582, flexPriceUSD: null, iva: 0.21, watts: 3600, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7052, category: 'inversor', sku: 'MIN4200TL-X2', name: 'Growatt MIN4200 On-Grid Mono 4.2kW', description: 'On-Grid monofásico 2 MPPT 4200W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 623, flexPriceUSD: null, iva: 0.21, watts: 4200, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7053, category: 'inversor', sku: 'MIN5000TL-X2', name: 'Growatt MIN5000 On-Grid Mono 5kW', description: 'On-Grid monofásico 2 MPPT 5000W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 630, flexPriceUSD: null, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },
  { id: 7054, category: 'inversor', sku: 'MIN6000TL-X2', name: 'Growatt MIN6000 On-Grid Mono 6kW', description: 'On-Grid monofásico 2 MPPT 6000W. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 599, flexPriceUSD: null, iva: 0.21, watts: 6000, brand: 'Growatt', cashDiscount: 0, phase: 'mono', voltage: 220 },

  // === INVERSORES ON-GRID 380V - TRIFÁSICOS (IVA 21%) ===
  { id: 7060, category: 'inversor', sku: 'MOD3000TL3-X', name: 'Growatt MOD3000 On-Grid Tri 3kW', description: 'On-Grid trifásico 2 MPPT 3000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 838, flexPriceUSD: null, iva: 0.21, watts: 3000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7061, category: 'inversor', sku: 'MOD4000TL3-X', name: 'Growatt MOD4000 On-Grid Tri 4kW', description: 'On-Grid trifásico 2 MPPT 4000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 877, flexPriceUSD: null, iva: 0.21, watts: 4000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7062, category: 'inversor', sku: 'MOD5000TL3-X', name: 'Growatt MOD5000 On-Grid Tri 5kW', description: 'On-Grid trifásico 2 MPPT 5000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 969, flexPriceUSD: null, iva: 0.21, watts: 5000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7063, category: 'inversor', sku: 'MOD6000TL3-X', name: 'Growatt MOD6000 On-Grid Tri 6kW', description: 'On-Grid trifásico 2 MPPT 6000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 585, flexPriceUSD: null, iva: 0.21, watts: 6000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7064, category: 'inversor', sku: 'MOD10000TL3-X', name: 'Growatt MOD10000 On-Grid Tri 10kW', description: 'On-Grid trifásico 2 MPPT 10000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 622, flexPriceUSD: null, iva: 0.21, watts: 10000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7065, category: 'inversor', sku: 'MOD15KTL3-X', name: 'Growatt MOD15K On-Grid Tri 15kW', description: 'On-Grid trifásico 2 MPPT 15000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 888, flexPriceUSD: null, iva: 0.21, watts: 15000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7066, category: 'inversor', sku: 'MID15KTL3-X', name: 'Growatt MID15K On-Grid Tri 15kW', description: 'On-Grid trifásico 2 MPPT 15000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 956, flexPriceUSD: null, iva: 0.21, watts: 15000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7067, category: 'inversor', sku: 'MID20KTL3-X2', name: 'Growatt MID20K On-Grid Tri 20kW', description: 'On-Grid trifásico 2 MPPT 20000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 1649, flexPriceUSD: null, iva: 0.21, watts: 20000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7068, category: 'inversor', sku: 'MID25KTL3-X2', name: 'Growatt MID25K On-Grid Tri 25kW', description: 'On-Grid trifásico 2 MPPT 25000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 1949, flexPriceUSD: null, iva: 0.21, watts: 25000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7069, category: 'inversor', sku: 'MID30KTL3-X2', name: 'Growatt MID30K On-Grid Tri 30kW', description: 'On-Grid trifásico 2 MPPT 30000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 1101, flexPriceUSD: null, iva: 0.21, watts: 30000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7070, category: 'inversor', sku: 'MID40KTL3-X2', name: 'Growatt MID40K On-Grid Tri 40kW', description: 'On-Grid trifásico 4 MPPT 40000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 2225, flexPriceUSD: null, iva: 0.21, watts: 40000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7071, category: 'inversor', sku: 'MID50KTL3-X2', name: 'Growatt MID50K On-Grid Tri 50kW', description: 'On-Grid trifásico 4 MPPT 50000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 2672, flexPriceUSD: null, iva: 0.21, watts: 50000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7072, category: 'inversor', sku: 'MAX50KTL3 LV', name: 'Growatt MAX50K On-Grid Tri 50kW', description: 'On-Grid trifásico 6 MPPT 50000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 2734, flexPriceUSD: null, iva: 0.21, watts: 50000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7073, category: 'inversor', sku: 'MAX80KTL3 LV', name: 'Growatt MAX80K On-Grid Tri 80kW', description: 'On-Grid trifásico 7 MPPT 80000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 3021, flexPriceUSD: null, iva: 0.21, watts: 80000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },
  { id: 7074, category: 'inversor', sku: 'MAX100KTL3-X2 LV', name: 'Growatt MAX100K On-Grid Tri 100kW', description: 'On-Grid trifásico 8 MPPT 100000W. Con AFCI. Incluye Dongle WIFI-X. 5 años garantía.', priceUSD: 3805, flexPriceUSD: null, iva: 0.21, watts: 100000, brand: 'Growatt', cashDiscount: 0, phase: 'tri', voltage: 380 },

  // === ESTRUCTURAS (IVA 21%) — Kits para 4 paneles ===
  { id: 7080, category: 'estructura', sku: 'CHIKOTRIANG1530V2', name: 'Kit Estructura Triangular Chiko (losa) x4 paneles', description: 'Aluminio, ángulo 15-30°, hormigón no incluido. 4 triángulos 1870x960. ~16kg.', priceUSD: 221, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Chiko Solar', cashDiscount: 0, roofType: 'losa', panelsPerKit: 4 },
  { id: 7081, category: 'estructura', sku: 'CHIKOCOPLANAR2.4', name: 'Kit Estructura Coplanar Chiko (chapa) x4 paneles', description: 'Aluminio, perfil L para techo metálico coplanar. 4 perfiles de 2.4m. ~9kg.', priceUSD: 81, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Chiko Solar', cashDiscount: 0, roofType: 'chapa', panelsPerKit: 4 },
  { id: 7082, category: 'estructura', sku: 'CHIKOTEJAS', name: 'Kit Estructura Tejas Chiko x4 paneles', description: 'Aluminio, montaje para techo de teja. ~12kg.', priceUSD: 106, flexPriceUSD: null, iva: 0.21, watts: null, brand: 'Chiko Solar', cashDiscount: 0, roofType: 'teja', panelsPerKit: 4 },

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
