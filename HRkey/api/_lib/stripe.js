// api/_lib/stripe.js
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20"
});

// Dominios permitidos para CORS en funciones serverless
export const ALLOWED_ORIGINS = new Set([
  "https://hrkey.xyz",
  "https://www.hrkey.xyz",
  "http://localhost:3000",
  "http://localhost:8080"
]);

// Helper to check if origin matches Vercel preview pattern
function isVercelPreview(origin) {
  if (!origin) return false;
  return origin.includes('.vercel.app') || origin.includes('hrkey');
}

// Aplica CORS (simple) a las respuestas
export function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin) || isVercelPreview(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

// Helper para respuestas a OPTIONS (preflight)
export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    allowOrigin(req, res);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return true;
  }
  return false;
}
