export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
            ]
          }]
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Gemini API error' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return res.status(200).json({ result: JSON.parse(jsonMatch[0]) });
    } else {
      return res.status(422).json({ error: 'No se pudo extraer datos de la factura' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
