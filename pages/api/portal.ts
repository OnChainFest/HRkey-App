import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'email required' });

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('email', email)
    .maybeSingle();

  if (!user?.stripe_customer_id) return res.status(404).json({ error: 'no_customer' });

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${req.headers.origin}/account`,
  });

  res.status(200).json({ url: session.url });
}
