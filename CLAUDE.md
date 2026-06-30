# Solar Nav — Calculador Solar Navimaq

## Negocio
Navimaq: negocio de energía solar en Argentina (con socios).
Venta e instalación de paneles, termotanques y equipos solares.
Este calculador ayuda a clientes a ver el ROI de instalar paneles.

## Contexto técnico
- **Stack:** HTML + Vanilla JS + Vercel Serverless
- **API:** Gemini 2.0 Flash para OCR de facturas de luz
- **Deploy:** Vercel → solar-nav.vercel.app
- **Admin:** /admin.html (password protegido)
- **Catálogo:** 400+ SKUs en js/data.js

## Features
- OCR facturas (Gemini) → auto-fill calculador
- Motor ROI 25 años, 24 provincias, Ley 27.424
- Rate limiting 10 req/IP/min

## Reglas
- GEMINI_API_KEY en env vars de Vercel, nunca hardcodear
- data.js tiene 57k+ líneas, no leer entero innecesariamente
- Precios en USD → conversión ARS dinámica
