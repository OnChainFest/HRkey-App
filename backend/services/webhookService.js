/**
 * Webhook Service
 * Handles Stripe webhook event processing with proper database updates
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Check if a Stripe event has already been processed (idempotency)
 * @param {string} eventId - Stripe event ID
 * @returns {Promise<boolean>} - True if already processed
 */
export async function isEventProcessed(eventId) {
  const { data, error } = await supabaseClient
    .from('stripe_events')
    .select('id')
    .eq('stripe_event_id', eventId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking event:', error);
    throw error;
  }

  return !!data;
}

/**
 * Mark a Stripe event as processed
 * @param {string} eventId - Stripe event ID
 * @param {string} eventType - Event type (e.g., 'payment_intent.succeeded')
 * @param {object} metadata - Additional event metadata
 * @returns {Promise<object>} - Created event record
 */
export async function markEventProcessed(eventId, eventType, metadata = {}) {
  const { data, error } = await supabaseClient
    .from('stripe_events')
    .insert([{
      stripe_event_id: eventId,
      event_type: eventType,
      metadata,
      processed_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.error('Error marking event as processed:', error);
    throw error;
  }

  return data;
}

/**
 * Process successful payment intent
 *
 * @param {object} paymentIntent - Stripe payment intent object
 * @returns {Promise<object>} - Result with user, transaction, and event data
 */
export async function processPaymentSuccess(paymentIntent) {
  const email = paymentIntent.receipt_email;
  const amount = paymentIntent.amount; // in cents
  const paymentIntentId = paymentIntent.id;
  const metadata = paymentIntent.metadata || {};

  console.log('Processing payment success:', {
    email,
    amount: amount / 100,
    paymentIntentId,
    plan: metadata.plan
  });

  // Step 1: Find user by email
  const { data: user, error: userError } = await supabaseClient
    .from('users')
    .select('id, email, role, plan')
    .eq('email', email)
    .maybeSingle();

  if (userError && userError.code !== 'PGRST116') {
    console.error('Error finding user:', userError);
    throw new Error(`Failed to find user: ${userError.message}`);
  }

  if (!user) {
    console.warn(`User not found for email: ${email}. Payment recorded but plan not updated.`);
    return {
      success: false,
      reason: 'user_not_found',
      email,
      paymentIntentId
    };
  }

  // Step 2: Update user plan
  const newPlan = metadata.plan || 'pro-lifetime';
  const { error: updateError } = await supabaseClient
    .from('users')
    .update({
      plan: newPlan,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('Error updating user plan:', updateError);
    throw new Error(`Failed to update user plan: ${updateError.message}`);
  }

  console.log(`✅ Updated user ${user.id} to plan: ${newPlan}`);

  // Step 3: Create revenue transaction record
  const { data: transaction, error: txError } = await supabaseClient
    .from('revenue_transactions')
    .insert([{
      user_id: user.id,
      user_email: email,
      transaction_type: 'PAYMENT',
      amount: amount / 100, // Convert cents to dollars
      currency: paymentIntent.currency.toUpperCase(),
      description: `Payment for ${newPlan} plan`,
      external_tx_id: paymentIntentId,
      payment_provider: 'stripe',
      metadata: {
        stripe_payment_intent_id: paymentIntentId,
        promo_code: metadata.promoCode || 'none',
        plan: newPlan
      }
    }])
    .select()
    .single();

  if (txError) {
    console.error('Error creating transaction:', txError);
    // Don't throw - user already got their plan
    // Log error and continue
  } else {
    console.log(`✅ Created transaction ${transaction.id} for $${amount / 100}`);
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      plan: newPlan
    },
    transaction: transaction ? {
      id: transaction.id,
      amount: amount / 100,
      currency: paymentIntent.currency.toUpperCase()
    } : null,
    paymentIntentId
  };
}

/**
 * Process failed payment intent
 *
 * @param {object} paymentIntent - Stripe payment intent object
 * @returns {Promise<object>} - Result with logging info
 */
export async function processPaymentFailed(paymentIntent) {
  const email = paymentIntent.receipt_email;
  const amount = paymentIntent.amount;
  const paymentIntentId = paymentIntent.id;

  console.warn('Payment failed:', {
    email,
    amount: amount / 100,
    paymentIntentId,
    last_payment_error: paymentIntent.last_payment_error
  });

  // TODO: Send email notification to user about failed payment
  // TODO: Log to audit trail

  return {
    success: true,
    action: 'logged',
    email,
    paymentIntentId
  };
}

export default {
  isEventProcessed,
  markEventProcessed,
  processPaymentSuccess,
  processPaymentFailed
};
