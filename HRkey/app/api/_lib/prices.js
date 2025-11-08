// api/_lib/prices.js
// Usa variable de entorno para evitar hardcodear IDs
// Vercel → Project Settings → Environment Variables → PRICE_ID_LIFETIME
export const PRICE_MAP = {
  lifetime: process.env.PRICE_ID_LIFETIME // p.ej. price_123_test (USD 9.99 one-time)
};
