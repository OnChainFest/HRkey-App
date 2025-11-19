import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'email required' });

    // 1) Busca usuario y expiración actual
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, subscription_expires_at, stripe_customer_id')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) return res.status(404).json({ error: 'user not found' });

    // 2) Calcula trial_end dinámico si aún tiene meses gratis
    const nowUnix = Math.floor(Date.now() / 1000);
    const expiresUnix = Math.floor(new Date(user.subscription_expires_at).getTime() / 1000);
    const useTrial = expiresUnix > nowUnix + 3600; // >1h

    // 3) Asegura customer
    let customerId = user.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await supabaseAdmin.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // 4) Evita duplicar suscripciones activas
    const activeSubs = await stripe.subscriptions.list({ customer: customerId!, status: 'active', limit: 1 });
    if (activeSubs.data.length > 0) {
      return res.status(409).json({ error: 'subscription_active', message: 'User already has an active subscription' });
    }

    // 5) Crea Checkout Session
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId!,
      line_items: [{ price: process.env.PRICE_ID_ANNUAL!, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/account`,
    };

    if (useTrial) params.subscription_data = { trial_end: expiresUnix };

    const session = await stripe.checkout.sessions.create(params);
    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    return res.status(500).json({ error: 'server_error', message: e?.message });
  }
}
