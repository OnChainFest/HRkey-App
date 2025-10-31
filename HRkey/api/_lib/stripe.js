import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20"
});

// Dominios permitidos para CORS simple en funciones serverless
export const ALLOWED_ORIGINS = new Set([
  "https://hrkey.xyz",
  "https://www.hrkey.xyz"
]);

export function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}
