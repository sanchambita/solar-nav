// Save solar lead to Supabase + send budget email via Resend
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { name, email, phone, budget } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Nombre y email son requeridos' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
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

  // 2. Build email HTML
  const b = budget || {};
  const fmtARS = (n) => n ? '$' + Math.round(n).toLocaleString('es-AR') : '-';

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#f4c430;margin:0;font-size:22px;">Navimaq Solar</h1>
    <p style="color:#ccc;margin:4px 0 0;font-size:13px;">Presupuesto Preliminar Estimativo</p>
  </td></tr>

  <tr><td style="padding:24px;">
    <p style="margin:0 0 16px;font-size:15px;">Hola <strong>${escHtml(name)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;">Gracias por utilizar nuestro calculador solar. A continuacion te compartimos tu presupuesto estimativo:</p>

    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#1a1a2e;">Sistema Propuesto</td></tr>
      ${b.systemType ? `<tr><td style="color:#777;">Tipo</td><td style="text-align:right;font-weight:500;">${escHtml(b.systemType)}</td></tr>` : ''}
      ${b.province ? `<tr><td style="color:#777;">Ubicacion</td><td style="text-align:right;font-weight:500;">${escHtml(b.province)}</td></tr>` : ''}
      ${b.monthlyKwh ? `<tr><td style="color:#777;">Consumo mensual</td><td style="text-align:right;font-weight:500;">${b.monthlyKwh} kWh</td></tr>` : ''}
      ${b.numPanels ? `<tr><td style="color:#777;">Paneles</td><td style="text-align:right;font-weight:500;">${b.numPanels}x ${escHtml(b.panelName || '')}</td></tr>` : ''}
      ${b.inverterInfo ? `<tr><td style="color:#777;">Inversor</td><td style="text-align:right;font-weight:500;">${escHtml(b.inverterInfo)}</td></tr>` : ''}
      ${b.batteryCount > 0 ? `<tr><td style="color:#777;">Baterias</td><td style="text-align:right;font-weight:500;">${b.batteryCount}x Pylontech US5000</td></tr>` : ''}
      ${b.structureInfo ? `<tr><td style="color:#777;">Estructura</td><td style="text-align:right;font-weight:500;">${escHtml(b.structureInfo)}</td></tr>` : ''}
    </table>

    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;margin-top:12px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#1a1a2e;">Desglose de Costos</td></tr>
      ${b.panelCostARS ? `<tr><td style="color:#777;">Paneles</td><td style="text-align:right;">${fmtARS(b.panelCostARS)}</td></tr>` : ''}
      ${b.inverterCostARS ? `<tr><td style="color:#777;">Inversor</td><td style="text-align:right;">${fmtARS(b.inverterCostARS)}</td></tr>` : ''}
      ${b.structureCostARS ? `<tr><td style="color:#777;">Estructura</td><td style="text-align:right;">${fmtARS(b.structureCostARS)}</td></tr>` : ''}
      ${b.batteryCostARS > 0 ? `<tr><td style="color:#777;">Baterias</td><td style="text-align:right;">${fmtARS(b.batteryCostARS)}</td></tr>` : ''}
      ${b.installCostARS ? `<tr><td style="color:#777;">Instalacion</td><td style="text-align:right;">${fmtARS(b.installCostARS)}</td></tr>` : ''}
      <tr style="background:#1a1a2e;color:#f4c430;font-weight:bold;font-size:16px;">
        <td>TOTAL ESTIMADO</td><td style="text-align:right;">${fmtARS(b.totalCostARS)}</td>
      </tr>
    </table>

    ${b.annualSavingsARS ? `
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #eee;border-radius:8px;font-size:14px;margin-top:12px;">
      <tr style="background:#f9f9f9;"><td colspan="2" style="font-weight:bold;font-size:15px;color:#1a1a2e;">Ahorro Estimado</td></tr>
      <tr><td style="color:#777;">Ahorro anual</td><td style="text-align:right;color:#2a9d2a;font-weight:bold;">${fmtARS(b.annualSavingsARS)}</td></tr>
      ${b.paybackYears ? `<tr><td style="color:#777;">Recupero de inversion</td><td style="text-align:right;font-weight:500;">${b.paybackYears} anos</td></tr>` : ''}
    </table>` : ''}

    <div style="margin-top:20px;padding:16px;background:#fff8e1;border:1px solid #f4c430;border-radius:8px;">
      <p style="margin:0 0 8px;font-weight:bold;font-size:14px;color:#1a1a2e;">Presupuesto Preliminar Estimativo</p>
      <p style="margin:0 0 8px;font-size:13px;color:#555;">Nota importante: Los valores y condiciones de esta cotizacion son de caracter orientativo y estan sujetos a modificaciones tras la realizacion de la visita tecnica en el domicilio.</p>
      <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#1a1a2e;">Condiciones del Servicio</p>
      <p style="margin:0 0 8px;font-size:13px;color:#555;">Ubicacion de los paneles: Se definira de manera definitiva durante la inspeccion tecnica presencial. Garantia: 12 meses de cobertura sobre la instalacion.</p>
      <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#1a1a2e;">Exclusiones del Presupuesto</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#555;">
        <li>Gestion y tramites para la solicitud del medidor bidireccional.</li>
        <li>Adecuaciones, reformas o modificaciones en la acometida o el pilar del medidor.</li>
      </ul>
    </div>

    <div style="margin-top:24px;text-align:center;">
      <a href="https://wa.me/5491155881126?text=${encodeURIComponent('Hola, recibí mi presupuesto solar y me gustaría avanzar.')}" style="display:inline-block;padding:12px 28px;background:#25d366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">Contactar por WhatsApp</a>
    </div>
  </td></tr>

  <tr><td style="background:#1a1a2e;padding:16px;text-align:center;">
    <p style="color:#888;font-size:12px;margin:0;">Navimaq Solar &mdash; Energia renovable para Argentina</p>
    <p style="color:#666;font-size:11px;margin:4px 0 0;">ventas@navimaqsolar.com.ar</p>
  </td></tr>
</table>
</body>
</html>`;

  // 3. Send email via Resend
  let emailSent = false;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Navimaq Solar <ventas@navimaqsolar.com.ar>',
        to: [email],
        bcc: ['ventas@navimaqsolar.com.ar'],
        subject: `Tu presupuesto solar - ${b.numPanels || ''} paneles ${b.systemType || ''}`.trim(),
        html: emailHtml,
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
