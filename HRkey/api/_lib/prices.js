// api/_lib/prices.js
// Usa variable de entorno para evitar hardcodear IDs
// Vercel → Project Settings → Environment Variables
export const PRICE_MAP = {
  lifetime: process.env.PRICE_ID_LIFETIME, // p.ej. price_123_test (USD 9.99 one-time)
  pro: process.env.PRICE_ID_PRO || process.env.STRIPE_PRICE_ID, // price_... (USD 0.50 one-time)
  annual: process.env.PRICE_ID_ANNUAL // Annual subscription
};
