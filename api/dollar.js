// Fetch dólar oficial from BNA.com.ar
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const response = await fetch('https://www.bna.com.ar/Personas', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await response.text();

    // Parse "Dolar U.S.A" row from the cotizaciones table
    // Format: <td>Dolar U.S.A</td><td ...>1.410,00</td><td ...>1.460,00</td>
    const dolarMatch = html.match(/Dolar U\.S\.A[\s\S]*?<td[^>]*>([\d.,]+)<\/td>\s*<td[^>]*>([\d.,]+)<\/td>/i);

    if (!dolarMatch) {
      return res.status(502).json({ error: 'No se pudo parsear cotización BNA' });
    }

    const parseARS = (str) => parseFloat(str.replace(/\./g, '').replace(',', '.'));
    const compra = parseARS(dolarMatch[1]);
    const venta = parseARS(dolarMatch[2]);

    return res.status(200).json({
      compra,
      venta,
      source: 'BNA',
      date: new Date().toISOString().split('T')[0],
    });
  } catch (err) {
    return res.status(502).json({ error: 'Error fetching BNA: ' + err.message });
  }
}
