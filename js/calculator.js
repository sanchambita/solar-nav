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
  litio:  { dod: 0.95, efficiency: 0.95, cycleLife: 6000, label: 'Litio LiFePO4' },
};

function calculateSolar(params) {
  const cfg = getConfig();
  const products = getProducts();

  const {
    provinceId, monthlyKwh, tariffId,
    systemType = 'ongrid',
    phaseType = 'mono',
    roofType = 'chapa',
    maxPowerKw = 10,
    numPanelsOverride = null,
    autonomyHours = 24,
    batteryType = 'litio',
    criticalLoadWatts = 3000,
    panelId = null,
    inverterId = null,
    structureItems = null, // [{id, qty}]
    billPricePerKwh = null,
  } = params;

  // 1. Ubicación
  const province = PROVINCES.find(p => p.id === provinceId);
  if (!province) return { error: 'Provincia no encontrada' };
  const hsp = province.hsp;

  // 2. Tarifa — usar precio real de factura si está disponible
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return { error: 'Tarifa no encontrada' };
  const tariffRange = tariff.ranges.find(r => monthlyKwh >= r.min && monthlyKwh <= r.max);
  const pricePerKwh = billPricePerKwh || (tariffRange ? tariffRange.priceKwh : tariff.ranges[tariff.ranges.length - 1].priceKwh);

  // 3. Parámetros según tipo de sistema
  const sys = SYSTEM_DEFAULTS[systemType] || SYSTEM_DEFAULTS.ongrid;
  const bat = BATTERY_DEFAULTS[batteryType] || BATTERY_DEFAULTS.litio;

  const dailyKwh = monthlyKwh / 30;
  const effectiveHsp = systemType === 'offgrid' ? hsp * sys.winterFactor : hsp;

  // 4. Dimensionamiento paneles
  let systemKwpNeeded = (dailyKwh * sys.panelOversize) / (effectiveHsp * sys.efficiency);

  const panels = products.filter(p => p.category === 'panel').sort((a, b) => b.watts - a.watts);
  // Excel: kits ≤20kW usan Jinko 550W, kits ≥50kW usan Amerisolar 580W
  let autoPanel = panels[0];
  if (!panelId && systemKwpNeeded <= 20) {
    const jinko = panels.find(p => p.name.toLowerCase().includes('jinko'));
    if (jinko) autoPanel = jinko;
  }
  const selectedPanel = (panelId && products.find(p => p.id === panelId && p.category === 'panel'))
    || autoPanel
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

  let numPanels = numPanelsOverride || recommendedPanels;
  let actualSystemKwp = numPanels * panelWp;

  // Power limit check
  let powerLimitWarning = null;
  if (actualSystemKwp > maxPowerKw) {
    powerLimitWarning = `Sistema limitado de ${actualSystemKwp.toFixed(1)} kWp a ${maxPowerKw} kWp por límite de potencia configurado`;
    actualSystemKwp = maxPowerKw;
    numPanels = Math.floor(maxPowerKw / panelWp);
  }

  // 5. Seleccionar inversor según tipo
  const inverterCategory = systemType === 'offgrid' ? 'inversor-offgrid'
    : systemType === 'hybrid' ? 'inversor-hibrido' : 'inversor';

  let inverters = products.filter(p => p.category === inverterCategory && p.watts)
    .filter(p => !p.phase || p.phase === phaseType)
    .sort((a, b) => a.watts - b.watts);
  if (inverters.length === 0) {
    inverters = products.filter(p => (p.category === 'inversor' || p.category === 'inversor-offgrid' || p.category === 'inversor-hibrido') && p.watts)
      .filter(p => !p.phase || p.phase === phaseType)
      .sort((a, b) => a.watts - b.watts);
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
    // Battery sized by: cargas críticas (W) × autonomía (horas) → kWh necesarios
    // Luego verificar que cubra potencia nominal del inversor
    const inverterWatts = selectedInverters.reduce((sum, i) => sum + i.product.watts * i.qty, 0);
    const energyNeededKwh = (criticalLoadWatts * autonomyHours) / 1000;
    const batteries = products.filter(p => p.category === 'bateria' && p.capacityKwh);
    if (batteries.length > 0) {
      selectedBattery = batteries[0]; // Pylontech US5000
      const maxDischargeW = selectedBattery.maxDischargeW || 5000;
      // Mínimo: cubrir energía (autonomía) O cubrir potencia del inversor
      const byEnergy = Math.ceil(energyNeededKwh / selectedBattery.capacityKwh);
      const byPower = Math.ceil(inverterWatts / maxDischargeW);
      batteryCount = Math.max(byEnergy, byPower);
      batteryKwh = batteryCount * selectedBattery.capacityKwh;
      batteryCostARS = batteryCount * calcFinalPriceARS(selectedBattery);
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
    const structureProduct = products.find(p => p.category === 'estructura' && p.roofType === roofType);
    if (structureProduct) {
      const kitsNeeded = Math.ceil(numPanels / (structureProduct.panelsPerKit || 4));
      structureCostARS = kitsNeeded * calcFinalPriceARS(structureProduct);
      structureDetail = [{ name: structureProduct.name, qty: kitsNeeded, unitARS: calcFinalPriceARS(structureProduct), totalARS: structureCostARS }];
    } else {
      structureCostARS = panelCostARS * (cfg.structurePercent || 0.15);
    }
  }
  const equipmentCostARS = panelCostARS + inverterCostARS + structureCostARS + batteryCostARS;

  // Costos de protecciones, instalación y cableado — FIJOS por rango de potencia (Excel CreativARTE)
  const inverterTotalWatts = selectedInverters.reduce((sum, i) => sum + i.product.watts * i.qty, 0);
  const sysCosts = getSystemCosts(systemType, phaseType, inverterTotalWatts);
  const serviceIVA = 1.21; // 21% IVA para servicios
  const protectionsCostARS = sysCosts.protectionsUSD * cfg.dollarRate * serviceIVA;
  const installCostARS = sysCosts.installUSD * cfg.dollarRate * serviceIVA;
  const cablingCostARS = sysCosts.cablingUSD * cfg.dollarRate * serviceIVA;

  // Total = equipos (variable) + protecciones/instalación/cableado (fijo por rango)
  const totalCostARS = equipmentCostARS + protectionsCostARS + installCostARS + cablingCostARS;

  // 8. Generación y ahorro — Metodología Excel Colo (balance neto facturación)
  const annualGenerationKwh = actualSystemKwp * hsp * 365 * sys.efficiency;
  const monthlyGenerationKwh = annualGenerationKwh / 12;

  // Generación mensual estacional
  const monthlyGeneration = calculateMonthlyGeneration(actualSystemKwp, hsp, sys.efficiency);

  // Cuota de autoconsumo: no toda la generación se usa directo (60% del consumo es diurno)
  const selfConsumptionQuota = cfg.selfConsumptionQuota || 0.60;
  const injectionPriceKwh = cfg.injectionPriceKwh || 105.1;
  const impuestosFactor = 1 + (cfg.billIVA || 0.21) + (cfg.municipalTax || 0.064);

  // Balance energético mensual
  const autoconsumidaKwh = Math.min(monthlyKwh * selfConsumptionQuota, monthlyGenerationKwh);
  const inyectadaKwh = Math.max(0, monthlyGenerationKwh - autoconsumidaKwh);
  const demandadaKwh = monthlyKwh - autoconsumidaKwh;

  // Ahorro = energía autoconsumida (no comprada) + crédito por inyección
  const monthlySavingsAutoconsumo = autoconsumidaKwh * pricePerKwh;
  let monthlyInjectionARS = 0;
  let excessMonthlyKwh = 0;
  if (systemType !== 'offgrid') {
    excessMonthlyKwh = inyectadaKwh;
    monthlyInjectionARS = inyectadaKwh * injectionPriceKwh * impuestosFactor;
  }
  const monthlySavingsARS = monthlySavingsAutoconsumo + monthlyInjectionARS;
  const annualSavingsARS = monthlySavingsAutoconsumo * 12;
  const annualInjectionARS = monthlyInjectionARS * 12;
  const totalAnnualBenefitARS = annualSavingsARS + annualInjectionARS;

  // 9. Factura antes/después (balance neto)
  const monthlyBillBefore = monthlyKwh * pricePerKwh;
  const monthlyBillAfter = Math.max(0, demandadaKwh * pricePerKwh - monthlyInjectionARS);
  const billReductionPct = monthlyBillBefore > 0 ? ((monthlyBillBefore - monthlyBillAfter) / monthlyBillBefore) * 100 : 0;

  // 10. ROI — Metodología Excel Colo: VAN, TIR, LCOE, Payback
  const projectLife = cfg.projectLifeYears || 20;
  const projection = generateProjection({
    totalCostARS, totalAnnualBenefitARS, inverterCostARS,
    annualGenerationKwh, pricePerKwh, injectionPriceKwh, impuestosFactor,
    selfConsumptionQuota, monthlyKwh, systemType,
  }, cfg);

  const paybackYears = projection.paybackYear || 99;
  const lastYear = projection.cumulativeCashflow.length - 1;
  const roi25years = totalCostARS > 0 ? (projection.cumulativeCashflow[lastYear] / totalCostARS) * 100 : 0;

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
    autonomyHours, criticalLoadWatts,

    // Costs
    panelCostARS, inverterCostARS, structureCostARS, structureDetail,
    batteryCostARS, protectionsCostARS, installCostARS, cablingCostARS,
    equipmentCostARS, totalCostARS,

    // Generation & Savings (balance neto)
    annualGenerationKwh, monthlyGenerationKwh,
    monthlyGeneration,
    coveragePercent,
    monthlySavingsARS, annualSavingsARS,
    excessMonthlyKwh, monthlyInjectionARS, annualInjectionARS,
    totalAnnualBenefitARS,

    // Balance energético (Colo)
    autoconsumidaKwh, inyectadaKwh, demandadaKwh,
    selfConsumptionQuota,

    // Bill comparison
    monthlyBillBefore, monthlyBillAfter, billReductionPct,

    // ROI — VAN, TIR, LCOE, Payback
    paybackYears, roi25years,
    van: projection.van,
    tir: projection.tir,
    lcoe: projection.lcoe,
    projectLife,
    projection,

    // Environmental
    annualCO2kg, treesEquivalent,

    // Warnings
    offgridWarning,
    powerLimitWarning,

    // New params
    phaseType, roofType, maxPowerKw,
    refPanels: sysCosts.refPanels || null,
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

// Proyección con metodología Excel Colo: VAN, TIR, LCOE, Payback
function generateProjection(data, cfg) {
  const {
    totalCostARS, totalAnnualBenefitARS, inverterCostARS,
    annualGenerationKwh, pricePerKwh, injectionPriceKwh, impuestosFactor,
    selfConsumptionQuota, monthlyKwh, systemType,
  } = data;

  const projectLife = cfg.projectLifeYears || 20;
  const degradation = cfg.panelDegradation || 0.005;
  const inflation = cfg.tariffInflation || 0;
  const discountRate = cfg.discountRate || 0;
  const inverterLife = cfg.inverterLifeYears || 20;

  const years = [];
  const cumulativeCashflow = [];
  const cashflows = [-totalCostARS]; // año 0
  let cumulative = -totalCostARS;
  let paybackYear = null;
  let totalGenDiscounted = 0;

  for (let y = 1; y <= projectLife; y++) {
    // Generación con degradación
    const genFactor = Math.pow(1 - degradation, y);
    const yearGenKwh = annualGenerationKwh * genFactor;
    const yearMonthlyGen = yearGenKwh / 12;

    // Precio kWh con inflación (0 por defecto = precios constantes como Excel)
    const yearPriceKwh = pricePerKwh * Math.pow(1 + inflation, y);
    const yearInjectionPrice = injectionPriceKwh * Math.pow(1 + inflation, y);

    // Balance energético con cuota de autoconsumo (metodología Colo)
    const yearAutoconsumo = Math.min(monthlyKwh * selfConsumptionQuota, yearMonthlyGen) * 12;
    const yearInyectada = Math.max(0, yearGenKwh - yearAutoconsumo);
    const yearDemandada = monthlyKwh * 12 - yearAutoconsumo;

    // Ahorro por autoconsumo (energía que no comprás)
    const yearSavings = yearAutoconsumo * yearPriceKwh;

    // Crédito por inyección (tarifa ENRE)
    let yearInjection = 0;
    if (systemType !== 'offgrid') {
      yearInjection = yearInyectada * yearInjectionPrice * impuestosFactor;
    }

    const yearBenefit = yearSavings + yearInjection;

    // Reemplazo inversor (solo si vida útil < vida proyecto)
    const inverterReplacement = (inverterLife < projectLife && y === inverterLife)
      ? inverterCostARS * Math.pow(1 + inflation, y) * 0.5 : 0;

    const yearNet = yearBenefit - inverterReplacement;
    cumulative += yearNet;
    cashflows.push(yearNet);

    // Generación descontada para LCOE
    const discFactor = discountRate > 0 ? Math.pow(1 + discountRate, y) : 1;
    totalGenDiscounted += yearGenKwh / discFactor;

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

  // VAN (Valor Actual Neto)
  let van = -totalCostARS;
  for (let y = 1; y <= projectLife; y++) {
    const discFactor = discountRate > 0 ? Math.pow(1 + discountRate, y) : 1;
    van += cashflows[y] / discFactor;
  }

  // TIR (Tasa Interna de Retorno) — bisección
  const tir = calculateTIR(cashflows);

  // LCOE (Costo Nivelado de Energía) = VAN_costos / generación descontada total
  const lcoe = totalGenDiscounted > 0 ? totalCostARS / totalGenDiscounted : 0;

  return { years, cumulativeCashflow, paybackYear, van: Math.round(van), tir, lcoe: Math.round(lcoe * 100) / 100 };
}

// TIR por bisección (busca tasa donde VAN = 0)
function calculateTIR(cashflows) {
  let lo = -0.5, hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    let npv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + mid, t);
    }
    if (npv > 0) lo = mid;
    else hi = mid;
    if (Math.abs(hi - lo) < 0.0001) break;
  }
  const result = (lo + hi) / 2;
  return Math.round(result * 10000) / 10000; // 4 decimales (ej: 0.1912 = 19.12%)
}

// Auto-calculate structure based on panel count and roof type (M2.4)
function autoCalculateStructure(numPanels, roofType) {
  // roofType: 'chapa', 'teja', 'losa'
  const products = getProducts();
  const items = [];

  // Find structure product matching roofType
  const structureProduct = products.find(p => p.category === 'estructura' && p.roofType === roofType);

  if (structureProduct) {
    const panelsPerKit = structureProduct.panelsPerKit || 4;
    const kitsNeeded = Math.ceil(numPanels / panelsPerKit);
    const unitARS = calcFinalPriceARS(structureProduct);
    items.push({ id: structureProduct.id, qty: kitsNeeded, name: structureProduct.name, unitARS });
  } else {
    // Fallback: use first available structure
    const fallback = products.find(p => p.category === 'estructura');
    if (fallback) {
      const panelsPerKit = fallback.panelsPerKit || 4;
      const kitsNeeded = Math.ceil(numPanels / panelsPerKit);
      const unitARS = calcFinalPriceARS(fallback);
      items.push({ id: fallback.id, qty: kitsNeeded, name: fallback.name, unitARS });
    }
  }

  return {
    items,
    totalARS: items.reduce((sum, i) => sum + i.qty * i.unitARS, 0),
    description: roofType === 'losa' ? 'Estructura inclinada (losa)' : roofType === 'teja' ? 'Coplanar (teja)' : 'Coplanar (chapa)',
  };
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
