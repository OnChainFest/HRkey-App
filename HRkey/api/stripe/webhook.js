// api/stripe/webhook.js
import { stripe } from "../_lib/stripe.js";

// TODO: Reemplaza por tu persistencia real (DB)
async function grantLifetimeToUser({ email, source, promo }) {
  console.log("GRANT (webhook):", { email, source, promo, at: new Date().toISOString() });
  // Aquí marcarías al usuario con plan = LIFETIME en tu base de datos
  return true;
}

// Necesario para verificar la firma: desactiva bodyParser
export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Lee cuerpo crudo
  let buf = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => (buf += chunk));
    req.on("end", resolve);
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(buf), sig, endpointSecret, 300);
  } catch (err) {
    console.error("Invalid webhook signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      if (email) {
        await grantLifetimeToUser({
          email,
          source: "stripe",
          promo: session.metadata?.promo || ""
        });
      }
    }
    // Otros eventos útiles: payment_intent.succeeded, charge.succeeded, etc.

    return res.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    return res.status(500).send("Webhook handler error");
  }
}
