// ============================================================
// SOLAR NAV - Charts Module (Chart.js)
// Generación mensual, Proyección 25 años, Desglose costos
// ============================================================

let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// 1. Generación mensual vs Consumo (barras + línea)
function renderMonthlyChart(canvasId, monthlyGen, monthlyConsumption) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = monthlyGen.map(m => m.month);
  const genData = monthlyGen.map(m => m.kwh);
  const consumoData = Array(12).fill(Math.round(monthlyConsumption));

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Generacion solar (kWh)',
          data: genData,
          backgroundColor: 'rgba(0, 212, 170, 0.7)',
          borderColor: '#00d4aa',
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'Consumo mensual (kWh)',
          data: consumoData,
          type: 'line',
          borderColor: '#888',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 768 ? 1 : 2,
      plugins: {
        legend: {
          labels: { color: '#e0e0e0', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('es-AR') + ' kWh',
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: {
            color: '#888',
            callback: v => v.toLocaleString('es-AR'),
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

// 2. Proyeccion 25 años (barras ahorro + línea cashflow acumulado)
function renderProjectionChart(canvasId, projection) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = projection.years.map(y => 'Año ' + y.year);
  const benefits = projection.years.map(y => y.netBenefit);
  const cumulative = projection.years.map(y => y.cumulative);

  // Barras: verde = beneficio, rojo en año de reemplazo inversor
  const barColors = projection.years.map(y =>
    y.inverterReplacement > 0 ? 'rgba(255, 71, 87, 0.7)' : 'rgba(46, 213, 115, 0.6)'
  );

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Beneficio neto anual',
          data: benefits,
          backgroundColor: barColors,
          borderRadius: 3,
          order: 2,
          yAxisID: 'y',
        },
        {
          label: 'Cashflow acumulado',
          data: cumulative,
          type: 'line',
          borderColor: '#ffd700',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 768 ? 1 : 2.5,
      plugins: {
        legend: {
          labels: { color: '#e0e0e0', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y;
              return ctx.dataset.label + ': ' + new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#888',
            maxRotation: 45,
            callback: function(val, i) { return (i + 1) % 5 === 0 || i === 0 ? (i + 1) : ''; },
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: {
            color: '#888',
            callback: v => (v / 1000000).toFixed(1) + 'M',
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

// 3. Desglose de costos (donut)
function renderCostDonut(canvasId, costs) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const data = [];
  const labels = [];
  const colors = ['#00d4aa', '#ffd700', '#ff6b81', '#70a1ff', '#7bed9f'];

  if (costs.panelCostARS > 0) { labels.push('Paneles'); data.push(costs.panelCostARS); }
  if (costs.inverterCostARS > 0) { labels.push('Inversor'); data.push(costs.inverterCostARS); }
  if (costs.batteryCostARS > 0) { labels.push('Baterias'); data.push(costs.batteryCostARS); }
  if (costs.structureCostARS > 0) { labels.push('Estructura'); data.push(costs.structureCostARS); }
  if (costs.installCostARS > 0) { labels.push('Instalacion'); data.push(costs.installCostARS); }

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderColor: '#12121a',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#e0e0e0', font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((val / total) * 100).toFixed(0);
              return ctx.label + ': ' + new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val) + ' (' + pct + '%)';
            },
          },
        },
      },
    },
  });
}
