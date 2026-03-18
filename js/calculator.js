// ============================================================
// SOLAR CALC - Calculator Engine
// On-Grid / Off-Grid / Híbrido — dimensionamiento, baterías, ROI
// ============================================================

// Constantes de sistema
const SYSTEM_DEFAULTS = {
  ongrid:  { efficiency: 0.80, winterFactor: 1.0, panelOversize: 1.0, label: 'On-Grid' },
  hybrid:  { efficiency: 0.78, winterFactor: 1.0, panelOversize: 1.0, label: 'Híbrido' },
  offgrid: { efficiency: 0.75, winterFactor: 0.55, panelOversize: 1.30, label: 'Off-Grid' },
};

const BATTERY_DEFAULTS = {
  litio:  { dod: 0.80, efficiency: 0.95, cycleLife: 4000, label: 'Litio LiFePO4' },
  plomo:  { dod: 0.50, efficiency: 0.85, cycleLife: 600, label: 'Plomo-ácido' },
};

function calculateSolar(params) {
  const cfg = getConfig();
  const products = getProducts();

  const {
    provinceId, monthlyKwh, tariffId,
    systemType = 'ongrid',
    numPanelsOverride = null,
    autonomyDays = systemType === 'offgrid' ? 3 : 2,
    batteryType = 'litio',
    essentialLoadPct = systemType === 'hybrid' ? 50 : 100,
    panelId = null,
    inverterId = null,
    structureItems = null, // [{id, qty}]
  } = params;

  // 1. Ubicación
  const province = PROVINCES.find(p => p.id === provinceId);
  if (!province) return { error: 'Provincia no encontrada' };
  const hsp = province.hsp;

  // 2. Tarifa
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return { error: 'Tarifa no encontrada' };
  const tariffRange = tariff.ranges.find(r => monthlyKwh >= r.min && monthlyKwh <= r.max);
  const pricePerKwh = tariffRange ? tariffRange.priceKwh : tariff.ranges[tariff.ranges.length - 1].priceKwh;

  // 3. Parámetros según tipo de sistema
  const sys = SYSTEM_DEFAULTS[systemType] || SYSTEM_DEFAULTS.ongrid;
  const bat = BATTERY_DEFAULTS[batteryType] || BATTERY_DEFAULTS.litio;

  const dailyKwh = monthlyKwh / 30;
  const effectiveHsp = systemType === 'offgrid' ? hsp * sys.winterFactor : hsp;

  // 4. Dimensionamiento paneles
  let systemKwpNeeded = (dailyKwh * sys.panelOversize) / (effectiveHsp * sys.efficiency);

  const panels = products.filter(p => p.category === 'panel').sort((a, b) => b.watts - a.watts);
  const selectedPanel = (panelId && products.find(p => p.id === panelId && p.category === 'panel'))
    || panels[0]
    || { watts: cfg.defaultPanelWp, priceUSD: 125, iva: 0.105, name: 'Panel 550W' };
  const panelWp = selectedPanel.watts / 1000;

  let recommendedPanels = Math.ceil(systemKwpNeeded / panelWp);

  // Bug 3 fix: Off-grid debe cubrir 100% incluso en invierno
  let offgridWarning = null;
  if (systemType === 'offgrid') {
    const coverCheck = (recommendedPanels * panelWp * hsp * 365 * sys.efficiency / 12) / monthlyKwh * 100;
    if (coverCheck < 100) {
      // Forzar paneles hasta 100% cobertura anual
      const neededKwp = monthlyKwh / (hsp * 365 / 12 * sys.efficiency);
      const forcedPanels = Math.ceil(neededKwp / panelWp);
      if (forcedPanels > recommendedPanels) {
        recommendedPanels = forcedPanels;
        offgridWarning = 'Se agregaron paneles extra para garantizar 100% cobertura off-grid';
      }
    }
  }

  const numPanels = numPanelsOverride || recommendedPanels;
  const actualSystemKwp = numPanels * panelWp;

  // 5. Seleccionar inversor según tipo
  const inverterCategory = systemType === 'offgrid' ? 'inversor-offgrid'
    : systemType === 'hybrid' ? 'inversor-hibrido' : 'inversor';

  let inverters = products.filter(p => p.category === inverterCategory && p.watts).sort((a, b) => a.watts - b.watts);
  if (inverters.length === 0) {
    inverters = products.filter(p => (p.category === 'inversor' || p.category === 'inversor-offgrid' || p.category === 'inversor-hibrido') && p.watts).sort((a, b) => a.watts - b.watts);
  }

  const systemWatts = actualSystemKwp * 1000;
  let selectedInverters = [];

  if (inverterId) {
    const manualInv = products.find(p => p.id === inverterId && p.watts);
    if (manualInv) {
      const qty = Math.ceil(systemWatts / manualInv.watts) || 1;
      selectedInverters = [{ product: manualInv, qty }];
    }
  }
  if (selectedInverters.length === 0) {
    const singleInverter = inverters.find(inv => inv.watts >= systemWatts * 0.8);
    if (singleInverter) {
      selectedInverters = [{ product: singleInverter, qty: 1 }];
    } else if (inverters.length > 0) {
      const largest = inverters[inverters.length - 1];
      const qty = Math.ceil(systemWatts / largest.watts);
      selectedInverters = [{ product: largest, qty }];
    }
  }

  // 6. Cálculo de baterías (solo hybrid/offgrid) — Bug 1+2 fix
  let batteryKwh = 0;
  let batteryCount = 0;
  let selectedBattery = null;
  let batteryCostARS = 0;

  if (systemType !== 'ongrid') {
    const dailyLoad = systemType === 'hybrid' ? dailyKwh * (essentialLoadPct / 100) : dailyKwh;
    // Bug 2 fix: NO dividir por bat.efficiency (ya incluido en sys.efficiency)
    batteryKwh = (dailyLoad * autonomyDays) / bat.dod;

    // Bug 1 fix: Filtrar por capacityKwh en vez de watts
    // Seleccionar la batería que minimiza el costo total para la capacidad requerida
    const batteries = products.filter(p => p.category === 'bateria' && p.capacityKwh);
    if (batteries.length > 0) {
      let bestCost = Infinity;
      for (const bat of batteries) {
        const count = Math.ceil(batteryKwh / bat.capacityKwh);
        const cost = count * calcFinalPriceARS(bat);
        if (cost < bestCost) {
          bestCost = cost;
          selectedBattery = bat;
          batteryCount = count;
          batteryCostARS = cost;
        }
      }
    }
  }

  // 7. Costos — Bug 8 fix: instalación varía por tipo de sistema
  const panelCostARS = numPanels * calcFinalPriceARS(selectedPanel);

  let inverterCostARS = 0;
  selectedInverters.forEach(inv => {
    inverterCostARS += inv.qty * calcFinalPriceARS(inv.product);
  });

  let structureCostARS = 0;
  let structureDetail = [];
  if (structureItems && structureItems.length > 0) {
    for (const item of structureItems) {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        const cost = item.qty * calcFinalPriceARS(prod);
        structureCostARS += cost;
        structureDetail.push({ name: prod.name, qty: item.qty, unitARS: calcFinalPriceARS(prod), totalARS: cost });
      }
    }
  } else {
    structureCostARS = panelCostARS * cfg.structurePercent;
  }
  const equipmentCostARS = panelCostARS + inverterCostARS + structureCostARS + batteryCostARS;
  const installMultiplier = (cfg.installMultipliers && cfg.installMultipliers[systemType]) || 1.0;
  const installCostARS = (cfg.installBaseUSD + numPanels * cfg.installPerPanelUSD) * cfg.dollarRate * installMultiplier;
  const totalCostARS = equipmentCostARS + installCostARS;

  // 8. Generación y ahorro
  const annualGenerationKwh = actualSystemKwp * hsp * 365 * sys.efficiency;
  const monthlyGenerationKwh = annualGenerationKwh / 12;

  // Generación mensual estacional
  const monthlyGeneration = calculateMonthlyGeneration(actualSystemKwp, hsp, sys.efficiency);

  const effectiveMonthlyKwh = Math.min(monthlyGenerationKwh, monthlyKwh);
  const monthlySavingsARS = effectiveMonthlyKwh * pricePerKwh;
  const annualSavingsARS = monthlySavingsARS * 12;

  // Bug 9 fix: usar CONFIG.injectionPriceFactor
  const injectionFactor = cfg.injectionPriceFactor || 0.50;
  let excessMonthlyKwh = 0;
  let monthlyInjectionARS = 0;
  let annualInjectionARS = 0;
  if (systemType !== 'offgrid') {
    excessMonthlyKwh = Math.max(0, monthlyGenerationKwh - monthlyKwh);
    const injectionPriceKwh = pricePerKwh * injectionFactor;
    monthlyInjectionARS = excessMonthlyKwh * injectionPriceKwh;
    annualInjectionARS = monthlyInjectionARS * 12;
  }

  const totalAnnualBenefitARS = annualSavingsARS + annualInjectionARS;

  // 9. Factura antes/después
  const monthlyBillBefore = monthlyKwh * pricePerKwh;
  const monthlyBillAfter = Math.max(0, (monthlyKwh - effectiveMonthlyKwh) * pricePerKwh);
  const billReductionPct = monthlyBillBefore > 0 ? ((monthlyBillBefore - monthlyBillAfter) / monthlyBillBefore) * 100 : 0;

  // 10. ROI — Bug 5+6+7: proyección 25 años con degradación, inflación, reemplazo inversor
  const projection = generate25YearProjection({
    totalCostARS, totalAnnualBenefitARS, inverterCostARS,
    annualGenerationKwh, pricePerKwh, injectionFactor,
    monthlyKwh, systemType,
  }, cfg);

  const paybackYears = projection.paybackYear || 99;
  const roi25years = totalCostARS > 0 ? (projection.cumulativeCashflow[24] / totalCostARS) * 100 : 0;

  // 11. Ambiental
  const annualCO2kg = annualGenerationKwh * cfg.co2Factor;
  const treesEquivalent = Math.round(annualCO2kg / 22);

  // 12. Superficie
  const areaM2 = numPanels * cfg.panelArea;

  // Cobertura
  const coveragePercent = Math.min(100, (monthlyGenerationKwh / monthlyKwh) * 100);

  return {
    // Input echo
    province: province.name, hsp, monthlyKwh, pricePerKwh,
    tariffLabel: tariffRange ? tariffRange.label : 'N/A',
    systemType, systemTypeLabel: sys.label,

    // Sizing
    systemKwp: actualSystemKwp,
    numPanels, recommendedPanels,
    selectedPanel: selectedPanel.name, panelWatts: selectedPanel.watts,
    selectedInverters: selectedInverters.map(i => ({
      name: i.product.name, qty: i.qty, watts: i.product.watts,
      priceARS: i.qty * calcFinalPriceARS(i.product),
    })),
    areaM2,

    // Battery
    batteryKwh: Math.round(batteryKwh * 10) / 10,
    batteryCount,
    selectedBattery: selectedBattery ? selectedBattery.name : null,
    batteryCapKwh: selectedBattery ? selectedBattery.capacityKwh : 0,
    batteryCostARS,
    batteryType, batteryTypeLabel: bat.label,
    autonomyDays, essentialLoadPct,

    // Costs
    panelCostARS, inverterCostARS, structureCostARS, structureDetail,
    batteryCostARS, installCostARS, totalCostARS,

    // Generation & Savings
    annualGenerationKwh, monthlyGenerationKwh,
    monthlyGeneration,
    coveragePercent,
    monthlySavingsARS, annualSavingsARS,
    excessMonthlyKwh, monthlyInjectionARS, annualInjectionARS,
    totalAnnualBenefitARS,

    // Bill comparison
    monthlyBillBefore, monthlyBillAfter, billReductionPct,

    // ROI
    paybackYears, roi25years,
    projection,

    // Environmental
    annualCO2kg, treesEquivalent,

    // Warnings
    offgridWarning,
  };
}

// Generación mensual estacional (12 meses)
function calculateMonthlyGeneration(systemKwp, hsp, efficiency) {
  const factors = HSP_MONTHLY_FACTORS;
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return factors.map((f, i) => ({
    month: MONTH_NAMES[i],
    kwh: Math.round(systemKwp * hsp * f * MONTH_DAYS[i] * efficiency),
    factor: f,
  }));
}

// Proyección 25 años con degradación, inflación tarifaria, reemplazo inversor
function generate25YearProjection(data, cfg) {
  const {
    totalCostARS, totalAnnualBenefitARS, inverterCostARS,
    annualGenerationKwh, pricePerKwh, injectionFactor,
    monthlyKwh, systemType,
  } = data;

  const degradation = cfg.panelDegradation || 0.005;
  const inflation = cfg.tariffInflation || 0.30;
  const inverterLife = cfg.inverterLifeYears || 12;

  const years = [];
  const cumulativeCashflow = [];
  let cumulative = -totalCostARS;
  let paybackYear = null;

  for (let y = 1; y <= 25; y++) {
    // Generación con degradación
    const genFactor = Math.pow(1 - degradation, y);
    const yearGenKwh = annualGenerationKwh * genFactor;

    // Precio kWh con inflación
    const yearPriceKwh = pricePerKwh * Math.pow(1 + inflation, y);

    // Ahorro: lo que no pagas de la red
    const yearEffectiveKwh = Math.min(yearGenKwh / 12, monthlyKwh) * 12;
    const yearSavings = yearEffectiveKwh * yearPriceKwh;

    // Inyección excedente
    let yearInjection = 0;
    if (systemType !== 'offgrid') {
      const yearExcess = Math.max(0, yearGenKwh - monthlyKwh * 12);
      yearInjection = yearExcess * yearPriceKwh * injectionFactor;
    }

    const yearBenefit = yearSavings + yearInjection;

    // Reemplazo inversor
    const inverterReplacement = (y === inverterLife) ? inverterCostARS * Math.pow(1 + inflation, y) * 0.5 : 0;

    const yearNet = yearBenefit - inverterReplacement;
    cumulative += yearNet;

    if (paybackYear === null && cumulative >= 0) {
      paybackYear = y;
    }

    years.push({
      year: y,
      generation: Math.round(yearGenKwh),
      savings: Math.round(yearSavings),
      injection: Math.round(yearInjection),
      benefit: Math.round(yearBenefit),
      inverterReplacement: Math.round(inverterReplacement),
      netBenefit: Math.round(yearNet),
      cumulative: Math.round(cumulative),
    });

    cumulativeCashflow.push(Math.round(cumulative));
  }

  return { years, cumulativeCashflow, paybackYear };
}

// Estimar kWh a partir de monto de factura
// Las tarifas en data.js son flat-rate por rango (precio efectivo incluyendo impuestos)
function estimateKwhFromBill(amountARS, tariffId) {
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return 300;

  // Buscar el rango donde amountARS / priceKwh cae dentro de [min, max]
  for (const range of tariff.ranges) {
    const estimatedKwh = amountARS / range.priceKwh;
    if (estimatedKwh >= range.min && estimatedKwh <= range.max) {
      return Math.round(estimatedKwh);
    }
  }

  // Fallback: usar el rango donde el costo máximo cubra el monto
  for (const range of tariff.ranges) {
    const maxCost = range.max * range.priceKwh;
    if (amountARS <= maxCost) {
      return Math.round(amountARS / range.priceKwh);
    }
  }

  const lastRange = tariff.ranges[tariff.ranges.length - 1];
  return Math.round(amountARS / lastRange.priceKwh);
}
