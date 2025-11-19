import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { buffer } from 'micro';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');
  const sig = req.headers['stripe-signature'] as string;
  const buf = await buffer(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.customer && session.subscription) {
          const sub = typeof session.subscription === 'string'
            ? await stripe.subscriptions.retrieve(session.subscription)
            : session.subscription;
          const customer = typeof session.customer === 'string'
            ? await stripe.customers.retrieve(session.customer)
            : session.customer;

          const email = (customer as any).email as string | undefined;
          if (email && sub?.current_period_end) {
            await supabaseAdmin
              .from('users')
              .update({
                stripe_customer_id: (customer as any).id,
                subscription_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
              })
              .eq('email', email);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await supabaseAdmin
          .from('users')
          .update({ subscription_expires_at: new Date(sub.current_period_end * 1000).toISOString() })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await supabaseAdmin
          .from('users')
          .update({ /* opcional: plan: 'free' */ })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }

      // opcional: invoice.payment_succeeded / failed
    }
  } catch (e: any) {
    return res.status(500).send(`Webhook handler error: ${e?.message}`);
  }

  res.json({ received: true });
}
