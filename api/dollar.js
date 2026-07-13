// Fetch dólar oficial — dolarapi.com (reliable) with BNA fallback
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Try dolarapi.com first (reliable, no scraping needed)
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      headers: { 'User-Agent': 'NavimaqSolar/1.0' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.compra && data.venta) {
        return res.status(200).json({
          compra: data.compra,
          venta: data.venta,
          source: 'dolarapi.com (BNA)',
          date: new Date().toISOString().split('T')[0],
        });
      }
    }
  } catch (_) {}

  // Fallback: scrape BNA directly
  try {
    const response = await fetch('https://www.bna.com.ar/Personas', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await response.text();
    const dolarMatch = html.match(/Dolar U\.S\.A[\s\S]*?<td[^>]*>([\d.,]+)<\/td>\s*<td[^>]*>([\d.,]+)<\/td>/i);

    if (dolarMatch) {
      const parseARS = (str) => parseFloat(str.replace(/\./g, '').replace(',', '.'));
      return res.status(200).json({
        compra: parseARS(dolarMatch[1]),
        venta: parseARS(dolarMatch[2]),
        source: 'BNA',
        date: new Date().toISOString().split('T')[0],
      });
    }
  } catch (_) {}

  return res.status(502).json({ error: 'No se pudo obtener cotización del dólar' });
}
