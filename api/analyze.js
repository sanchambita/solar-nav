// Rate limit: simple in-memory store (resets per cold start)
const rateLimit = new Map();
const RATE_LIMIT = 10; // max requests per IP per minute
const RATE_WINDOW = 60000;

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_PDF_MIMES = ['application/pdf'];
const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_PDF_MIMES];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB base64

const ALLOWED_FIELDS = [
  'proveedor', 'tarifa', 'tipo_tarifa', 'actividad', 'consumo_kwh',
  'dias_periodo', 'monto_total', 'cargo_fijo', 'cargo_variable_1',
  'cargo_variable_2', 'conceptos_electricos', 'impuestos', 'subsidio',
  'nivel_subsidio', 'titular', 'direccion', 'localidad', 'provincia',
  'periodo', 'numero_cuenta',
];

const PROMPT = `Analiza esta factura de electricidad de Argentina. El documento puede tener 1 o mas paginas — revisa TODAS las paginas para extraer los datos. Busca estos datos exactos y devuelve SOLO un JSON sin markdown:

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
  // CORS
  const origin = req.headers.origin || '';
  const allowed = ['https://solar-nav.vercel.app', 'https://solarcalculator-ar.vercel.app', 'http://localhost:3000'];
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

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) return res.status(500).json({ error: 'AI not configured' });

  try {
    const { image, mimeType } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No se envio imagen o documento' });
    }
    if (image.length > MAX_SIZE) {
      return res.status(413).json({ error: 'Archivo demasiado grande (max 10MB)' });
    }

    const isPdf = ALLOWED_PDF_MIMES.includes(mimeType);
    const isImage = ALLOWED_IMAGE_MIMES.includes(mimeType);

    if (!isPdf && !isImage) {
      return res.status(400).json({ error: 'Formato no soportado. Usa JPG, PNG o PDF.' });
    }

    const safeMime = ALLOWED_MIMES.includes(mimeType) ? mimeType : 'image/jpeg';
    let text = '';

    // --- Try Groq first (fast, free) — solo para imágenes, no soporta PDF ---
    if (groqKey && isImage) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                { type: 'image_url', image_url: { url: `data:${safeMime};base64,${image}` } }
              ]
            }],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          text = groqData.choices?.[0]?.message?.content || '';
        }
      } catch { /* fall through to Gemini */ }
    }

    // --- Fallback: Gemini (soporta PDF + imágenes multi-página) ---
    if (!text && geminiKey) {
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: safeMime, data: image } }
              ]
            }]
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const err = await geminiRes.json();
        if (!groqKey || isPdf) {
          return res.status(geminiRes.status).json({ error: err.error?.message || 'Error al analizar con IA' });
        }
      }
    }

    if (!text) {
      return res.status(502).json({ error: 'No se pudo conectar con la IA. Intenta de nuevo.' });
    }

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
