// api/checkout/session.js
import crypto from "crypto";
import { stripe, ALLOWED_ORIGINS, allowOrigin, handleOptions } from "../_lib/stripe.js";
import { PRICE_MAP } from "../_lib/prices.js";
import { PROMOS, isActive } from "../_lib/promos.js";

/* ───────────────────────── Helpers ───────────────────────── */

const isPost = (req) => req.method === "POST";
const isAllowedOrigin = (origin) => ALLOWED_ORIGINS.has(origin);
const getOrigin = (req) => req.headers.origin;

function parseBody(req) {
  const {
    plan = "annual",
    promo = "",
    email,
    success_url,
    cancel_url,
  } = req.body || {};
  return { plan, promoKey: String(promo || "").toUpperCase(), email, success_url, cancel_url };
}

function validatePlan(plan) {
  const priceId = PRICE_MAP[plan];
  if (!priceId) throw new HttpError(400, "Invalid plan");
  return priceId;
}

function validatePromo(promoKey) {
  const cfg = promoKey ? PROMOS[promoKey] : null;
  if (cfg && !isActive(cfg)) throw new HttpError(400, "Promo expired or not active");
  return cfg;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function buildIdempotencyKey(req, plan, promoKey) {
  const userKey = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anon").toString();
  return "chk_" + crypto.createHash("sha256").update(`${userKey}|${plan}|${promoKey || ""}`).digest("hex");
}

async function resolvePromotionCodeId(promoKey, promoCfg) {
  if (!promoKey) return null;
  const codeToUse = promoCfg?.stripe_code || promoKey;
  const list = await stripe.promotionCodes.list({ code: codeToUse, active: true, limit: 1 });
  return list.data[0]?.id || null;
}

function buildUrls({ success_url, cancel_url }) {
  return {
    success: success_url || "https://hrkey.xyz/success?session_id={CHECKOUT_SESSION_ID}",
    cancel : cancel_url  || "https://hrkey.xyz/cancel",
  };
}

async function createStripeSession({ plan, priceId, email, urls, idemKey, promoKey, promotion_code_id }) {
  const base = {
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    customer_email: email || undefined,
    client_reference_id: email || undefined,
    metadata: { plan, promo: promoKey || "", email: email || "", source: "hrkey_checkout_ready" },
  };

  if (plan === "annual") {
    return stripe.checkout.sessions.create(
      {
        ...base,
        mode: "subscription",
        payment_method_collection: "always",
        customer_creation: "always",
        discounts: promotion_code_id ? [{ promotion_code: promotion_code_id }] : [],
        success_url: urls.success,
        cancel_url: urls.cancel,
      },
      { idempotencyKey: idemKey }
    );
  }

  // plan === "lifetime"
  return stripe.checkout.sessions.create(
    {
      ...base,
      mode: "payment",
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      discounts: promotion_code_id ? [{ promotion_code: promotion_code_id }] : [],
      success_url: urls.success,
      cancel_url: urls.cancel,
    },
    { idempotencyKey: idemKey }
  );
}

/* ───────────────────────── Handler principal ───────────────────────── */

export default async function handler(req, res) {
  if (handleOptions(req, res)) return; // preflight
  allowOrigin(req, res);

  try {
    if (!isPost(req)) throw new HttpError(405, "Method not allowed");

    const origin = getOrigin(req);
    if (!isAllowedOrigin(origin)) throw new HttpError(403, "Forbidden");

    const { plan, promoKey, email, success_url, cancel_url } = parseBody(req);
    const priceId = validatePlan(plan);
    const promoCfg = validatePromo(promoKey);

    const idemKey = buildIdempotencyKey(req, plan, promoKey);
    const promotion_code_id = await resolvePromotionCodeId(promoKey, promoCfg);
    const urls = buildUrls({ success_url, cancel_url });

    const session = await createStripeSession({
      plan, priceId, email, urls, idemKey, promoKey, promotion_code_id
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("Checkout error:", e);
    return res.status(status).json({ error: e.message || "Checkout failed" });
  }
}
