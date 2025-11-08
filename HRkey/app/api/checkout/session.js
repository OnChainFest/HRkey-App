// api/checkout/session.js
import crypto from "crypto";
import { stripe, ALLOWED_ORIGINS, allowOrigin, handleOptions } from "../_lib/stripe.js";
import { PRICE_MAP } from "../_lib/prices.js";
import { PROMOS, isActive } from "../_lib/promos.js";

/**
 * (Opcional) Grant directo sin Stripe para ferias (free_grant)
 * Reemplazá por tu persistencia real.
 */
async function grantLifetimeToUser({ email, source, promo }) {
  console.log("GRANT LIFETIME:", { email, source, promo, at: new Date().toISOString() });
  // Aquí marcarías al usuario como plan = LIFETIME en tu DB
  return true;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return; // preflight
  allowOrigin(req, res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Anti-origen
  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const {
      // por defecto vamos a suscripción anual (primer año gratis con JUNGLE)
      plan = "annual",
      promo = "",           // e.g. "JUNGLE"
      email,                // email del usuario (recomendado)
      success_url,          // opcional override
      cancel_url            // opcional override
    } = req.body || {};

    const priceId = PRICE_MAP[plan];
    if (!priceId) return res.status(400).json({ error: "Invalid plan" });

    const promoKey = String(promo || "").toUpperCase();
    const promoCfg = promoKey ? PROMOS[promoKey] : null;
    if (promoCfg && !isActive(promoCfg)) {
      return res.status(400).json({ error: "Promo expired or not active" });
    }

    // ------------------------------------------------------------------
    // RUTA A: Grant gratuito (feria) → SIN Stripe (usa tu CRM/DB)
    // ------------------------------------------------------------------
    if (promoCfg && promoCfg.type === "free_grant") {
      if (!email) return res.status(400).json({ error: "Email is required for free activation" });
      await grantLifetimeToUser({ email, source: "event", promo: promoKey });
      return res.status(200).json({ url: "https://hrkey.xyz/thank-you.html?granted=1" });
    }

    // ------------------------------------------------------------------
    // RUTA B: Stripe Checkout
    // - "annual": suscripción con primer año gratis (JUNGLE),
    //             pide tarjeta ahora y renueva al año 2 automáticamente.
    // - "lifetime": pago único (opcional por compatibilidad).
    // ------------------------------------------------------------------

    // Idempotency key robusta (ip + plan + promo)
    const userKey =
      (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anon").toString();
    const idemKey = "chk_" + crypto.createHash("sha256")
      .update(userKey + "|" + plan + "|" + (promoKey || ""))
      .digest("hex");

    // Busca promotion_code en Stripe si corresponde
    // 1) Si PROMOS lo define como stripe, usamos promoCfg.stripe_code
    // 2) Sino, si vino promo en la request, intentamos buscarlo por código
    let promotion_code_id = null;
    if (promoCfg?.type === "stripe" && promoCfg.stripe_code) {
      const list = await stripe.promotionCodes.list({ code: promoCfg.stripe_code, active: true, limit: 1 });
      promotion_code_id = list.data[0]?.id || null;
    } else if (promoKey) {
      const list = await stripe.promotionCodes.list({ code: promoKey, active: true, limit: 1 });
      promotion_code_id = list.data[0]?.id || null;
    }

    // Config común
    const baseSuccess = success_url || "https://hrkey.xyz/success?session_id={CHECKOUT_SESSION_ID}";
    const baseCancel  = cancel_url  || "https://hrkey.xyz/cancel";

    let session;

    if (plan === "annual") {
      // ---------------------------
      // SUSCRIPCIÓN ANUAL (RECOMENDADA)
      // ---------------------------
      session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          payment_method_collection: "always", // pide tarjeta aunque total hoy sea $0
          customer_creation: "always",
          customer_email: email || undefined,

          line_items: [{ price: priceId, quantity: 1 }],

          // Aplica el promo (JUNGLE = 100% off 12 meses)
          discounts: promotion_code_id ? [{ promotion_code: promotion_code_id }] : [],
          allow_promotion_codes: true,

          success_url: baseSuccess,
          cancel_url: baseCancel,

          // clave para enlazar en tu webhook
          client_reference_id: email || undefined,
          metadata: {
            plan,
            promo: promoKey || "",
            email: email || "",
            source: "hrkey_checkout_ready",
          },
        },
        { idempotencyKey: idemKey }
      );
    } else {
      // ---------------------------
      // LIFETIME (pago único) — opcional
      // ---------------------------
      let discounts;
      if (promotion_code_id) {
        discounts = [{ promotion_code: promotion_code_id }];
      }

      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: baseSuccess,
          cancel_url: baseCancel,
          allow_promotion_codes: true,
          discounts,
          billing_address_collection: "auto",
          automatic_tax: { enabled: true },
          customer_email: email || undefined,

          client_reference_id: email || undefined,
          metadata: {
            plan,
            promo: promoKey || "",
            email: email || "",
            source: "hrkey_checkout_ready",
          },
        },
        { idempotencyKey: idemKey }
      );
    }

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Checkout error:", e);
    return res.status(500).json({ error: "Checkout failed" });
  }
}
