// ============================================================
// SOLAR CALC - Calculator Engine
// On-Grid / Off-Grid / Híbrido — dimensionamiento, baterías, ROI
// ============================================================

// Constantes de sistema
const SYSTEM_DEFAULTS = {
  ongrid:  { efficiency: 0.80, winterFactor: 1.0, panelOversize: 1.0, label: 'On-Grid' },
  hybrid:  { efficiency: 0.82, winterFactor: 1.0, panelOversize: 1.0, label: 'Híbrido' },
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
  const systemKwpNeeded = (dailyKwh * sys.panelOversize) / (effectiveHsp * sys.efficiency);

  const panels = products.filter(p => p.category === 'panel').sort((a, b) => b.watts - a.watts);
  const selectedPanel = panels[0] || { watts: cfg.defaultPanelWp, priceUSD: 125, iva: 0.105, name: 'Panel 550W' };
  const panelWp = selectedPanel.watts / 1000;

  const recommendedPanels = Math.ceil(systemKwpNeeded / panelWp);
  const numPanels = numPanelsOverride || recommendedPanels;
  const actualSystemKwp = numPanels * panelWp;

  // 5. Seleccionar inversor según tipo
  const inverterCategory = systemType === 'offgrid' ? 'inversor-offgrid'
    : systemType === 'hybrid' ? 'inversor-hibrido' : 'inversor';

  // Buscar en la categoría preferida, fallback a todas
  let inverters = products.filter(p => p.category === inverterCategory && p.watts).sort((a, b) => a.watts - b.watts);
  if (inverters.length === 0) {
    inverters = products.filter(p => (p.category === 'inversor' || p.category === 'inversor-offgrid' || p.category === 'inversor-hibrido') && p.watts).sort((a, b) => a.watts - b.watts);
  }

  const systemWatts = actualSystemKwp * 1000;
  let selectedInverters = [];

  const singleInverter = inverters.find(inv => inv.watts >= systemWatts * 0.8);
  if (singleInverter) {
    selectedInverters = [{ product: singleInverter, qty: 1 }];
  } else if (inverters.length > 0) {
    const largest = inverters[inverters.length - 1];
    const qty = Math.ceil(systemWatts / largest.watts);
    selectedInverters = [{ product: largest, qty }];
  }

  // 6. Cálculo de baterías (solo hybrid/offgrid)
  let batteryKwh = 0;
  let batteryCount = 0;
  let selectedBattery = null;
  let batteryCostARS = 0;

  if (systemType !== 'ongrid') {
    const dailyLoad = systemType === 'hybrid' ? dailyKwh * (essentialLoadPct / 100) : dailyKwh;
    batteryKwh = (dailyLoad * autonomyDays) / bat.dod / bat.efficiency;

    // Buscar baterías en catálogo
    const batteries = products.filter(p => p.category === 'bateria' && p.watts).sort((a, b) => b.watts - a.watts);
    if (batteries.length > 0) {
      selectedBattery = batteries[0];
      const batteryCapKwh = selectedBattery.watts / 1000;
      batteryCount = Math.ceil(batteryKwh / batteryCapKwh);
      batteryCostARS = batteryCount * calcFinalPriceARS(selectedBattery);
    }
  }

  // 7. Costos
  const panelCostARS = numPanels * calcFinalPriceARS(selectedPanel);

  let inverterCostARS = 0;
  selectedInverters.forEach(inv => {
    inverterCostARS += inv.qty * calcFinalPriceARS(inv.product);
  });

  const structureCostARS = panelCostARS * cfg.structurePercent;
  const equipmentCostARS = panelCostARS + inverterCostARS + structureCostARS + batteryCostARS;
  const installCostARS = equipmentCostARS * cfg.installCostPercent;
  const totalCostARS = equipmentCostARS + installCostARS;

  // 8. Generación y ahorro
  const annualGenerationKwh = actualSystemKwp * hsp * 365 * sys.efficiency;
  const monthlyGenerationKwh = annualGenerationKwh / 12;

  const effectiveMonthlyKwh = Math.min(monthlyGenerationKwh, monthlyKwh);
  const monthlySavingsARS = effectiveMonthlyKwh * pricePerKwh;
  const annualSavingsARS = monthlySavingsARS * 12;

  // Excedente inyectado (Ley 27.424) — solo on-grid/hybrid
  let excessMonthlyKwh = 0;
  let monthlyInjectionARS = 0;
  let annualInjectionARS = 0;
  if (systemType !== 'offgrid') {
    excessMonthlyKwh = Math.max(0, monthlyGenerationKwh - monthlyKwh);
    const injectionPriceKwh = pricePerKwh * 0.5;
    monthlyInjectionARS = excessMonthlyKwh * injectionPriceKwh;
    annualInjectionARS = monthlyInjectionARS * 12;
  }

  const totalAnnualBenefitARS = annualSavingsARS + annualInjectionARS;

  // 9. Factura antes/después
  const monthlyBillBefore = monthlyKwh * pricePerKwh;
  const monthlyBillAfter = Math.max(0, (monthlyKwh - effectiveMonthlyKwh) * pricePerKwh);
  const billReductionPct = monthlyBillBefore > 0 ? ((monthlyBillBefore - monthlyBillAfter) / monthlyBillBefore) * 100 : 0;

  // 10. ROI
  const paybackYears = totalAnnualBenefitARS > 0 ? totalCostARS / totalAnnualBenefitARS : 99;
  const roi25years = totalCostARS > 0 ? ((totalAnnualBenefitARS * 25) - totalCostARS) / totalCostARS * 100 : 0;

  // 11. Ambiental
  const annualCO2kg = annualGenerationKwh * cfg.co2Factor;
  const treesEquivalent = Math.round(annualCO2kg / 22);

  // 12. Superficie
  const areaM2 = numPanels * cfg.panelArea;

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
    batteryCapKwh: selectedBattery ? selectedBattery.watts / 1000 : 0,
    batteryCostARS,
    batteryType, batteryTypeLabel: bat.label,
    autonomyDays, essentialLoadPct,

    // Costs
    panelCostARS, inverterCostARS, structureCostARS,
    batteryCostARS, installCostARS, totalCostARS,

    // Generation & Savings
    annualGenerationKwh, monthlyGenerationKwh,
    coveragePercent: Math.min(100, (monthlyGenerationKwh / monthlyKwh) * 100),
    monthlySavingsARS, annualSavingsARS,
    excessMonthlyKwh, monthlyInjectionARS, annualInjectionARS,
    totalAnnualBenefitARS,

    // Bill comparison
    monthlyBillBefore, monthlyBillAfter, billReductionPct,

    // ROI
    paybackYears, roi25years,

    // Environmental
    annualCO2kg, treesEquivalent,
  };
}

// Estimar kWh a partir de monto de factura
function estimateKwhFromBill(amountARS, tariffId) {
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return 300;

  for (const range of tariff.ranges) {
    const maxCost = range.max * range.priceKwh;
    if (amountARS <= maxCost) {
      return Math.round(amountARS / range.priceKwh);
    }
  }

  const lastRange = tariff.ranges[tariff.ranges.length - 1];
  return Math.round(amountARS / lastRange.priceKwh);
}
