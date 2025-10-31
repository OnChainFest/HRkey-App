// api/checkout/session.js
import crypto from "crypto";
import { stripe, ALLOWED_ORIGINS, allowOrigin, handleOptions } from "../_lib/stripe.js";
import { PRICE_MAP } from "../_lib/prices.js";
import { PROMOS, isActive } from "../_lib/promos.js";

// TODO: Reemplaza por tu persistencia real (DB)
async function grantLifetimeToUser({ email, source, promo }) {
  console.log("GRANT LIFETIME:", { email, source, promo, at: new Date().toISOString() });
  // Aquí marcarías al usuario con plan = LIFETIME en tu base de datos
  return true;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return; // preflight

  allowOrigin(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Anti-origen
  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: "Forbidden" });

  try {
    const { plan = "lifetime", promo = "", email } = req.body || {};
    const priceId = PRICE_MAP[plan];
    if (!priceId) return res.status(400).json({ error: "Invalid plan" });

    const promoKey = String(promo || "").toUpperCase();
    const p = promoKey ? PROMOS[promoKey] : null;
    if (p && !isActive(p)) return res.status(400).json({ error: "Promo expired or not active" });

    // RUTA A: Grant gratuito (feria) → NO Stripe
    if (p && p.type === "free_grant") {
      if (!email) return res.status(400).json({ error: "Email is required for free activation" });
      await grantLifetimeToUser({ email, source: "event", promo: promoKey });
      return res.status(200).json({ url: "https://hrkey.xyz/thank-you.html?granted=1" });
    }

    // RUTA B: Pago (normal o 50% HRKEY50)
    const userKey = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anon").toString();
    const idemKey = "chk_" + crypto.createHash("sha256").update(userKey + plan + (promoKey || "")).digest("hex");

    // Si hay promo Stripe, intenta aplicarla desde el backend
    let discounts;
    if (p && p.type === "stripe") {
      const list = await stripe.promotionCodes.list({ code: p.stripe_code, active: true, limit: 1 });
      if (list.data[0]) discounts = [{ promotion_code: list.data[0].id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://hrkey.xyz/thank-you.html",
      cancel_url: "https://hrkey.xyz/pricing.html",
      allow_promotion_codes: true,     // también permite ingresar el código en el Checkout
      discounts,
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      metadata: { plan: "lifetime", promo: promoKey },
      customer_email: email || undefined
    }, { idempotencyKey: idemKey });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Checkout error:", e);
    return res.status(500).json({ error: "Checkout failed" });
  }
}
