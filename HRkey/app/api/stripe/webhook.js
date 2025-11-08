// api/stripe/webhook.js
import { stripe } from "../_lib/stripe.js";

/**
 * TODO: Reemplaza estas funciones por tu persistencia real (DB/Supabase/etc).
 * Mantengo grantLifetimeToUser para compatibilidad, y agrego helpers para suscripciones.
 */
async function grantLifetimeToUser({ email, source, promo }) {
  console.log("GRANT LIFETIME (webhook):", { email, source, promo, at: new Date().toISOString() });
  // Aquí marcarías al usuario con plan = LIFETIME en tu base de datos
  return true;
}

async function upsertUserAfterCheckoutSession({ email, customerId, subscriptionId, promo, metadata }) {
  console.log("UPSERT USER (checkout.session.completed):", {
    email,
    customerId,
    subscriptionId,
    promo,
    metadata,
    at: new Date().toISOString(),
  });
  // Ejemplo:
  // await db.users.upsert({ email, stripeCustomerId: customerId, subscriptionId, plan: 'pro-annual', status: 'active' })
  return true;
}

async function updateSubscriptionStatus({ customerId, subscriptionId, status, currentPeriodEnd }) {
  console.log("SUBSCRIPTION STATUS UPDATE:", {
    customerId,
    subscriptionId,
    status,
    currentPeriodEnd,
    at: new Date().toISOString(),
  });
  // Ejemplo:
  // await db.subscriptions.update({ stripeCustomerId: customerId }, { status, currentPeriodEnd })
  return true;
}

async function logInvoice({ customerId, invoiceId, amountPaid, currency, status }) {
  console.log("INVOICE LOG:", { customerId, invoiceId, amountPaid, currency, status, at: new Date().toISOString() });
  // Ejemplo:
  // await db.invoices.insert({ invoiceId, stripeCustomerId: customerId, amountPaid, currency, status })
  return true;
}

// Necesario para verificar la firma: desactiva bodyParser en Vercel/Next
export const config = {
  api: { bodyParser: false },
};

// Utilidad para leer el raw body del request
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("Server misconfigured");
  }

  let event;
  try {
    const buf = await readRawBody(req);
    // tolerancia 300s para evitar falsos negativos por latencias
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret, 300);
  } catch (err) {
    console.error("Invalid webhook signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      /**
       * Flujo principal: Stripe Checkout completado.
       * En tu implementación actual, usamos mode=subscription (1er año gratis con JUNGLE).
       */
      case "checkout.session.completed": {
        const session = event.data.object;
        const email =
          session.customer_details?.email ||
          session.customer_email ||
          session.metadata?.email ||
          null;

        const customerId = session.customer || null;
        const subscriptionId = session.subscription || null;
        const promo = session.metadata?.promo || ""; // en create-checkout-session pusimos metadata.promo = 'JUNGLE'
        const metadata = session.metadata || {};

        // Si alguna vez usaste modo "payment" para lifetime, podés seguir usando esta ruta:
        if (session.mode === "payment") {
          if (email) {
            await grantLifetimeToUser({ email, source: "stripe", promo });
          }
        }

        // Para el flujo actual (subscription + JUNGLE):
        await upsertUserAfterCheckoutSession({
          email,
          customerId,
          subscriptionId,
          promo,
          metadata,
        });

        break;
      }

      /**
       * Alta/actualización/baja de suscripciones.
       * Mantiene tu base de datos sincronizada con el estado real en Stripe.
       */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await updateSubscriptionStatus({
          customerId: sub.customer,
          subscriptionId: sub.id,
          status: sub.status, // active, trialing, past_due, canceled, etc.
          currentPeriodEnd: sub.current_period_end, // epoch seconds
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateSubscriptionStatus({
          customerId: sub.customer,
          subscriptionId: sub.id,
          status: "canceled",
          currentPeriodEnd: sub.current_period_end,
        });
        break;
      }

      /**
       * Facturación (renovaciones exitosas o fallidas).
       */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        await logInvoice({
          customerId: invoice.customer,
          invoiceId: invoice.id,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await logInvoice({
          customerId: invoice.customer,
          invoiceId: invoice.id,
          amountPaid: invoice.amount_paid || 0,
          currency: invoice.currency,
          status: invoice.status, // open / uncollectible / void, etc.
        });
        // Aquí podrías notificar al usuario y/o generar un enlace al Billing Portal.
        break;
      }

      default: {
        // Si querés loguear otros eventos:
        // console.log("Unhandled event type:", event.type);
        break;
      }
    }

    return res.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    return res.status(500).send("Webhook handler error");
  }
}
