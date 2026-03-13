// Rate limit: simple in-memory store (resets per cold start)
const rateLimit = new Map();
const RATE_LIMIT = 10; // max requests per IP per minute
const RATE_WINDOW = 60000;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB in base64 chars (~7.5MB raw)

const ALLOWED_FIELDS = [
  'proveedor', 'tarifa', 'tipo_tarifa', 'actividad', 'consumo_kwh',
  'dias_periodo', 'monto_total', 'cargo_fijo', 'cargo_variable_1',
  'cargo_variable_2', 'conceptos_electricos', 'impuestos', 'subsidio',
  'nivel_subsidio', 'titular', 'direccion', 'localidad', 'provincia',
  'periodo', 'numero_cuenta',
];

function checkRate(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

function sanitizeResult(raw) {
  const clean = {};
  for (const key of ALLOWED_FIELDS) {
    if (raw[key] !== undefined && raw[key] !== null) {
      const val = raw[key];
      if (typeof val === 'string') {
        clean[key] = val.replace(/[<>"'&]/g, '');
      } else if (typeof val === 'number') {
        clean[key] = val;
      }
    }
  }
  return clean;
}

export default async function handler(req, res) {
  // CORS: only allow our domain
  const origin = req.headers.origin || '';
  const allowed = ['https://solar-nav.vercel.app', 'http://localhost:3000'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

  try {
    const { image, mimeType } = req.body;

    // Validate image
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' });
    }
    if (image.length > MAX_IMAGE_SIZE) {
      return res.status(413).json({ error: 'Imagen demasiado grande (max 10MB)' });
    }

    // Validate MIME type
    const safeMime = ALLOWED_MIMES.includes(mimeType) ? mimeType : 'image/jpeg';

    const prompt = `Analiza esta factura de electricidad de Argentina. Busca estos datos exactos y devuelve SOLO un JSON sin markdown:

{
  "proveedor": "EDENOR" o "EDESUR" o "EPEC" o el nombre que figure,
  "tarifa": "T1-R3" o lo que diga en el campo TARIFA,
  "tipo_tarifa": "T1" o "T2" o "T3",
  "actividad": "RESIDENCIAL" o "COMERCIAL" o "INDUSTRIAL",
  "consumo_kwh": numero total de kWh consumidos (buscar "Total Consumo" o "kWh"),
  "dias_periodo": dias del periodo de facturacion,
  "monto_total": monto de "Total a pagar" en pesos,
  "cargo_fijo": monto del cargo fijo,
  "cargo_variable_1": monto del primer tramo variable,
  "cargo_variable_2": monto del segundo tramo variable si existe,
  "conceptos_electricos": subtotal de conceptos electricos,
  "impuestos": monto de impuestos y contribuciones,
  "subsidio": monto del subsidio si existe,
  "nivel_subsidio": "NIVEL 1" o "NIVEL 2" o "NIVEL 3" o "SIN SUBSIDIO",
  "titular": nombre del titular,
  "direccion": direccion completa del suministro/servicio,
  "localidad": ciudad o localidad,
  "provincia": provincia (ej: "Buenos Aires", "CABA", "Cordoba"),
  "periodo": periodo de consumo (ej: "18/12/2025 AL 21/01/2026"),
  "numero_cuenta": numero de cuenta o suministro
}

Si no puedes determinar un campo usa null. SOLO devuelve el JSON, sin backticks ni markdown.`;

    // Use header instead of URL param for API key
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: safeMime, data: image } }
            ]
          }]
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'AI error' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ result: sanitizeResult(parsed) });
    } else {
      return res.status(422).json({ error: 'No se pudo extraer datos de la factura' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
