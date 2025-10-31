// Evitamos hardcodear el price: usa variable de entorno
// Vercel: añade PRICE_ID_LIFETIME (test primero)
export const PRICE_MAP = {
  lifetime: process.env.PRICE_ID_LIFETIME // p.ej. price_123_test
};
