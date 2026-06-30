// Internal notification: send lead + bill + quote to ventas@navimaxsolar.com.ar
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { name, email, phone, budget, billImage } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Nombre y email requeridos' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;

  // 1. Save lead to Supabase
  let leadId = null;
  try {
    const leadData = {
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      province: budget?.province || null,
      monthly_kwh: budget?.monthlyKwh || null,
      system_type: budget?.systemType || null,
      total_cost_ars: budget?.totalCostARS || null,
      num_panels: budget?.numPanels || null,
      panel_name: budget?.panelName || null,
      inverter_info: budget?.inverterInfo || null,
      battery_count: budget?.batteryCount || null,
      structure_info: budget?.structureInfo || null,
      budget_json: budget || null,
    };

    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/solar_leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(leadData),
    });

    if (sbRes.ok) {
      const [row] = await sbRes.json();
      leadId = row?.id;
    } else {
      console.error('Supabase insert error:', await sbRes.text());
    }
  } catch (err) {
    console.error('Supabase error:', err.message);
  }

  // 2. Build internal notification email
  const b = budget || {};
  const fmtARS = (n) => n ? '$' + Math.round(n).toLocaleString('es-AR') : '-';
  const date = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
  <tr><td style="background:#171a20;padding:24px;text-align:center;">
    <h1 style="color:#e68a00;margin:0;font-size:22px;">Nueva Consulta Solar</h1>
    <p style="color:#ccc;margin:4px 0 0;font-size:13px;">${escHtml(date)} — Calculadora Web</p>
  </td></tr>

  <tr><td style="padding:24px;">
    <table width="100%" cellpadding="8" cellspacing="0" style="border:2px solid #e68a00;border-radius:8px;font-size:14px;margin-bottom:16px;">
      <tr style="background:#fff8e1;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#171a20;">Datos del Cliente</td></tr>
      <tr><td style="color:#777;width:120px;">Nombre</td><td style="font-weight:bold;">${escHtml(name)}</td></tr>
      <tr><td style="color:#777;">Email</td><td><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
      ${phone ? `<tr><td style="color:#777;">Telefono</td><td><a href="https://wa.me/${phone.replace(/\D/g, '')}">${escHtml(phone)}</a></td></tr>` : ''}
    </table>

    ${b.systemType ? `
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;margin-bottom:16px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#171a20;">Sistema Calculado</td></tr>
      <tr><td style="color:#777;">Tipo</td><td style="font-weight:500;">${escHtml(b.systemTypeLabel || b.systemType)}</td></tr>
      ${b.province ? `<tr><td style="color:#777;">Ubicacion</td><td>${escHtml(b.province)} (${b.hsp || '-'} HSP)</td></tr>` : ''}
      ${b.monthlyKwh ? `<tr><td style="color:#777;">Consumo</td><td>${b.monthlyKwh} kWh/mes</td></tr>` : ''}
      ${b.systemKwp ? `<tr><td style="color:#777;">Potencia</td><td>${Number(b.systemKwp).toFixed(1)} kWp</td></tr>` : ''}
      ${b.numPanels ? `<tr><td style="color:#777;">Paneles</td><td>${b.numPanels}x ${escHtml(b.panelName || '')}</td></tr>` : ''}
      ${b.inverterInfo ? `<tr><td style="color:#777;">Inversor</td><td>${escHtml(b.inverterInfo)}</td></tr>` : ''}
      ${b.batteryCount > 0 ? `<tr><td style="color:#777;">Baterias</td><td>${b.batteryCount}x Pylontech US5000</td></tr>` : ''}
      ${b.structureInfo ? `<tr><td style="color:#777;">Estructura</td><td>${escHtml(b.structureInfo)}</td></tr>` : ''}
      ${b.coveragePercent ? `<tr><td style="color:#777;">Cobertura</td><td>${Math.round(b.coveragePercent)}%</td></tr>` : ''}
    </table>` : ''}

    <div style="margin-bottom:16px;padding:20px;background:#fff8e1;border:2px solid #e68a00;border-radius:10px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:#777;text-transform:uppercase;letter-spacing:1px;">Inversion Total</p>
      <p style="margin:0;font-size:28px;font-weight:bold;color:#171a20;">${fmtARS(b.totalCostARS)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#888;">IVA incluido</p>
    </div>

    ${b.monthlySavingsARS ? `
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;margin-bottom:16px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#171a20;">Ahorro Estimado</td></tr>
      <tr><td style="color:#777;">Generación mensual</td><td style="font-weight:500;">${Math.round(b.monthlyGenerationKwh || 0)} kWh</td></tr>
      <tr><td style="color:#777;">Tarifa cliente</td><td style="font-weight:500;">${fmtARS(b.pricePerKwh)}/kWh</td></tr>
      <tr><td style="color:#777;">Ahorro mensual</td><td style="color:#00a650;font-weight:bold;">${fmtARS(b.monthlySavingsARS)}</td></tr>
      ${b.paybackYears ? `<tr><td style="color:#777;">Recupero</td><td style="font-weight:500;">${b.paybackYears} años</td></tr>` : ''}
    </table>` : ''}

    ${b.totalCostARS ? `
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#171a20;">Desglose Costos</td></tr>
      <tr><td style="color:#777;">Paneles</td><td style="text-align:right;">${fmtARS(b.panelCostARS)}</td></tr>
      <tr><td style="color:#777;">Inversor</td><td style="text-align:right;">${fmtARS(b.inverterCostARS)}</td></tr>
      <tr><td style="color:#777;">Estructura</td><td style="text-align:right;">${fmtARS(b.structureCostARS)}</td></tr>
      ${b.batteryCostARS > 0 ? `<tr><td style="color:#777;">Baterias</td><td style="text-align:right;">${fmtARS(b.batteryCostARS)}</td></tr>` : ''}
      <tr><td style="color:#777;">Instalación</td><td style="text-align:right;">${fmtARS(b.installCostARS)}</td></tr>
      <tr style="border-top:2px solid #e68a00;"><td style="font-weight:bold;">TOTAL</td><td style="text-align:right;font-weight:bold;">${fmtARS(b.totalCostARS)}</td></tr>
    </table>` : ''}
  </td></tr>

  <tr><td style="background:#171a20;padding:16px;text-align:center;">
    <p style="color:#888;font-size:12px;margin:0;">Navimaq Solar — Notificacion automatica del calculador</p>
  </td></tr>
</table>
</body>
</html>`;

  // 3. Send internal notification to ventas@navimaxsolar.com.ar
  let emailSent = false;
  try {
    const attachments = [];

    // Adjuntar factura del cliente si existe
    if (billImage) {
      attachments.push({
        filename: `factura-${name.replace(/\s+/g, '-').toLowerCase()}.jpg`,
        content: billImage,
      });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Navimaq Solar <ventas@navimaqsolar.com.ar>',
        to: ['ventas@navimaqsolar.com.ar'],
        subject: `Nueva consulta: ${escHtml(name)} — ${b.numPanels || '?'} paneles ${b.systemTypeLabel || b.systemType || ''}`.trim(),
        html: emailHtml,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });

    if (emailRes.ok) {
      emailSent = true;
    } else {
      const errData = await emailRes.json();
      console.error('Resend error:', errData);
    }
  } catch (err) {
    console.error('Email error:', err.message);
  }

  // 4. Update lead with email_sent status
  if (leadId && emailSent) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/solar_leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_sent: true }),
      });
    } catch (_) {}
  }

  return res.status(200).json({
    ok: true,
    leadId,
    emailSent,
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
