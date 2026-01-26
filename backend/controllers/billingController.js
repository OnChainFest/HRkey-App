/**
 * Billing Controller
 * Stripe-based paid features infrastructure
 * FIAT payments only - NO crypto payment intents
 */

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import logger from '../logger.js';
import { createNotification } from './notificationsController.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

let supabase;
const getSupabase = () => {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
};

let stripe;
const getStripe = () => {
  if (!stripe) {
    stripe = new Stripe(stripeSecretKey || 'sk_test_placeholder');
  }
  return stripe;
};

// Default URLs for Stripe redirect
const getDefaultUrls = () => {
  const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'https://hrkey.xyz';
  return {
    successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/billing/cancel`
  };
};

/**
 * POST /api/billing/create-checkout-session
 * Create a Stripe Checkout session for a product
 */
export async function createCheckoutSession(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { product_code, success_url, cancel_url } = req.body;

    // Fetch product from database
    const { data: product, error: productError } = await getSupabase()
      .from('products')
      .select('code, name, stripe_price_id')
      .eq('code', product_code)
      .single();

    if (productError) {
      if (productError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product '${product_code}' not found`
        });
      }
      throw productError;
    }

    // Validate stripe_price_id is configured
    if (!product.stripe_price_id || product.stripe_price_id.startsWith('price_placeholder')) {
      logger.warn('Product has placeholder Stripe price ID', {
        requestId: req.requestId,
        productCode: product_code,
        stripePriceId: product.stripe_price_id
      });
      return res.status(503).json({
        success: false,
        error: 'PRODUCT_NOT_CONFIGURED',
        message: 'This product is not yet available for purchase'
      });
    }

    const defaultUrls = getDefaultUrls();
    const finalSuccessUrl = success_url || defaultUrls.successUrl;
    const finalCancelUrl = cancel_url || defaultUrls.cancelUrl;

    // Create Stripe Checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price: product.stripe_price_id,
          quantity: 1
        }
      ],
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        user_id: userId,
        product_code: product_code
      }
    });

    // Store checkout session in database
    const { error: insertError } = await getSupabase()
      .from('checkout_sessions')
      .insert([{
        user_id: userId,
        product_code: product_code,
        stripe_session_id: session.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (insertError) {
      logger.error('Failed to store checkout session', {
        requestId: req.requestId,
        userId,
        sessionId: session.id,
        error: insertError.message
      });
      // Don't fail the request - Stripe session is already created
    }

    logger.info('Checkout session created', {
      requestId: req.requestId,
      userId,
      productCode: product_code,
      sessionId: session.id
    });

    return res.status(201).json({
      success: true,
      checkout_url: session.url,
      session_id: session.id
    });
  } catch (error) {
    logger.error('Failed to create checkout session', {
      requestId: req.requestId,
      userId: req.user?.id,
      productCode: req.body?.product_code,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create checkout session'
    });
  }
}

/**
 * Handle Stripe checkout.session.completed webhook event
 * Called from webhook handler in server.js
 * @param {Object} session - Stripe checkout session object
 * @returns {Promise<Object>} Processing result
 */
export async function handleCheckoutSessionCompleted(session) {
  const { id: sessionId, metadata, customer_email } = session;
  const userId = metadata?.user_id;
  const productCode = metadata?.product_code;

  if (!userId || !productCode) {
    logger.warn('Checkout session missing metadata', {
      sessionId,
      hasUserId: !!userId,
      hasProductCode: !!productCode
    });
    return { success: false, reason: 'MISSING_METADATA' };
  }

  try {
    // Update checkout session status
    const { error: updateError } = await getSupabase()
      .from('checkout_sessions')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_session_id', sessionId);

    if (updateError) {
      logger.error('Failed to update checkout session status', {
        sessionId,
        error: updateError.message
      });
    }

    // Grant feature flag to user
    const { error: flagError } = await getSupabase()
      .from('user_feature_flags')
      .upsert([{
        user_id: userId,
        feature_code: productCode,
        granted_at: new Date().toISOString(),
        checkout_session_id: null // We'd need to fetch the internal ID
      }], {
        onConflict: 'user_id,feature_code'
      });

    if (flagError) {
      logger.error('Failed to grant feature flag', {
        sessionId,
        userId,
        productCode,
        error: flagError.message
      });
      return { success: false, reason: 'FLAG_GRANT_FAILED' };
    }

    // Create notification for user
    try {
      await createNotification({
        userId,
        type: 'payment_success',
        title: 'Payment Successful',
        body: `Your purchase of ${productCode} has been completed successfully.`
      });
    } catch (notifError) {
      logger.warn('Failed to create payment notification', {
        userId,
        error: notifError.message
      });
    }

    logger.info('Checkout session completed successfully', {
      sessionId,
      userId,
      productCode
    });

    return { success: true, userId, productCode };
  } catch (error) {
    logger.error('Failed to process checkout completion', {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    return { success: false, reason: 'PROCESSING_ERROR' };
  }
}

/**
 * Handle Stripe checkout.session.expired webhook event
 * @param {Object} session - Stripe checkout session object
 */
export async function handleCheckoutSessionExpired(session) {
  const { id: sessionId } = session;

  try {
    await getSupabase()
      .from('checkout_sessions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_session_id', sessionId);

    logger.info('Checkout session marked as expired', { sessionId });
  } catch (error) {
    logger.error('Failed to mark checkout session as expired', {
      sessionId,
      error: error.message
    });
  }
}

export default {
  createCheckoutSession,
  handleCheckoutSessionCompleted,
  handleCheckoutSessionExpired
};
