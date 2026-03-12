// ============================================================
// SOLAR NAV - Calculator Engine
// Cálculos de dimensionamiento, costo, ahorro y ROI solar
// ============================================================

function calculateSolar(params) {
  const cfg = getConfig();
  const products = getProducts();

  const { provinceId, monthlyKwh, tariffId } = params;

  // 1. Datos de ubicación
  const province = PROVINCES.find(p => p.id === provinceId);
  if (!province) return { error: 'Provincia no encontrada' };

  const hsp = province.hsp;

  // 2. Tarifa
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return { error: 'Tarifa no encontrada' };

  // Calcular precio promedio ponderado de kWh
  const tariffRange = tariff.ranges.find(r => monthlyKwh >= r.min && monthlyKwh <= r.max);
  const pricePerKwh = tariffRange ? tariffRange.priceKwh : tariff.ranges[tariff.ranges.length - 1].priceKwh;

  // 3. Dimensionamiento del sistema
  // kWp necesarios = consumo mensual / (HSP × 30 días × eficiencia)
  const systemKwp = monthlyKwh / (hsp * 30 * cfg.efficiency);

  // 4. Seleccionar panel
  const panels = products.filter(p => p.category === 'panel').sort((a, b) => b.watts - a.watts);
  const selectedPanel = panels[0] || { watts: cfg.defaultPanelWp, priceUSD: 125, iva: 0.105, name: 'Panel 550W' };

  const panelWp = selectedPanel.watts / 1000; // kWp por panel
  const numPanels = Math.ceil(systemKwp / panelWp);
  const actualSystemKwp = numPanels * panelWp;

  // 5. Seleccionar inversor adecuado
  const inverters = products.filter(p => p.category === 'inversor' || p.category === 'inversor-offgrid' || p.category === 'inversor-hibrido').filter(p => p.watts).sort((a, b) => a.watts - b.watts);
  const systemWatts = actualSystemKwp * 1000;

  // Buscar inversor(es) que cubra(n) la potencia
  let selectedInverters = [];
  let remainingWatts = systemWatts;

  // Intentar con un solo inversor primero
  const singleInverter = inverters.find(inv => inv.watts >= systemWatts * 0.8);
  if (singleInverter) {
    selectedInverters = [{ product: singleInverter, qty: 1 }];
  } else {
    // Usar el más grande disponible y calcular cuántos
    const largest = inverters[inverters.length - 1];
    if (largest) {
      const qty = Math.ceil(systemWatts / largest.watts);
      selectedInverters = [{ product: largest, qty }];
    }
  }

  // 6. Costos
  const panelCostARS = numPanels * calcFinalPriceARS(selectedPanel);

  let inverterCostARS = 0;
  selectedInverters.forEach(inv => {
    inverterCostARS += inv.qty * calcFinalPriceARS(inv.product);
  });

  const structureCostARS = panelCostARS * cfg.structurePercent;
  const equipmentCostARS = panelCostARS + inverterCostARS + structureCostARS;
  const installCostARS = equipmentCostARS * cfg.installCostPercent;
  const totalCostARS = equipmentCostARS + installCostARS;

  // 7. Generación y ahorro
  const annualGenerationKwh = actualSystemKwp * hsp * 365 * cfg.efficiency;
  const monthlyGenerationKwh = annualGenerationKwh / 12;

  // Ahorro basado en lo que se deja de consumir de la red
  const effectiveMonthlyKwh = Math.min(monthlyGenerationKwh, monthlyKwh);
  const monthlySavingsARS = effectiveMonthlyKwh * pricePerKwh;
  const annualSavingsARS = monthlySavingsARS * 12;

  // Excedente inyectado (Ley 27.424)
  const excessMonthlyKwh = Math.max(0, monthlyGenerationKwh - monthlyKwh);
  const injectionPriceKwh = pricePerKwh * 0.5; // ~50% del precio de compra
  const monthlyInjectionARS = excessMonthlyKwh * injectionPriceKwh;
  const annualInjectionARS = monthlyInjectionARS * 12;

  const totalAnnualBenefitARS = annualSavingsARS + annualInjectionARS;

  // 8. ROI
  const paybackYears = totalCostARS / totalAnnualBenefitARS;
  const roi25years = ((totalAnnualBenefitARS * 25) - totalCostARS) / totalCostARS * 100;

  // 9. Ambiental
  const annualCO2kg = annualGenerationKwh * cfg.co2Factor;
  const treesEquivalent = Math.round(annualCO2kg / 22); // ~22kg CO2/árbol/año

  // 10. Superficie necesaria
  const areaM2 = numPanels * cfg.panelArea;

  return {
    // Input data
    province: province.name,
    hsp,
    monthlyKwh,
    pricePerKwh,
    tariffLabel: tariffRange ? tariffRange.label : 'N/A',

    // System sizing
    systemKwp: actualSystemKwp,
    numPanels,
    selectedPanel: selectedPanel.name,
    panelWatts: selectedPanel.watts,
    selectedInverters: selectedInverters.map(i => ({
      name: i.product.name,
      qty: i.qty,
      watts: i.product.watts,
    })),
    areaM2,

    // Costs
    panelCostARS,
    inverterCostARS,
    structureCostARS,
    installCostARS,
    totalCostARS,

    // Generation & Savings
    annualGenerationKwh,
    monthlyGenerationKwh,
    coveragePercent: Math.min(100, (monthlyGenerationKwh / monthlyKwh) * 100),
    monthlySavingsARS,
    annualSavingsARS,
    excessMonthlyKwh,
    monthlyInjectionARS,
    annualInjectionARS,
    totalAnnualBenefitARS,

    // ROI
    paybackYears,
    roi25years,

    // Environmental
    annualCO2kg,
    treesEquivalent,
  };
}

// Calcular costo mensual actual de electricidad basado en kWh y tarifa
function calcMonthlyBill(kwh, tariffId) {
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return 0;

  let total = 0;
  let remaining = kwh;

  for (const range of tariff.ranges) {
    if (remaining <= 0) break;
    const rangeSize = range.max - range.min + 1;
    const kwhInRange = Math.min(remaining, kwh <= range.max ? remaining : rangeSize);
    if (kwh >= range.min) {
      total = kwh * range.priceKwh; // Simplified: use the bracket price for all kWh
      break;
    }
  }

  return total;
}

// Estimar kWh a partir de monto de factura
function estimateKwhFromBill(amountARS, tariffId) {
  const tariff = TARIFFS.find(t => t.id === tariffId);
  if (!tariff) return 300;

  // Buscar el rango donde el monto encaja
  for (const range of tariff.ranges) {
    const maxCost = range.max * range.priceKwh;
    if (amountARS <= maxCost) {
      return Math.round(amountARS / range.priceKwh);
    }
  }

  // Si supera todos los rangos, usar el último precio
  const lastRange = tariff.ranges[tariff.ranges.length - 1];
  return Math.round(amountARS / lastRange.priceKwh);
}
