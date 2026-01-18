/**
 * Payments Controller
 *
 * Handles HTTP endpoints for payment operations:
 * - Create payment intents
 * - Check payment status
 * - Get payment history
 * - Handle payment webhooks
 */

import { Request, Response } from 'express';
import { getPaymentProcessor } from '../services/payments/payment-processor';
import { getXRPBridge } from '../services/payments/xrp-bridge';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/payments/create
 * Create a new payment intent for a reference purchase
 */
export async function createPayment(req: Request, res: Response): Promise<void> {
  try {
    const { referenceId, amount, providerEmail, candidateEmail } = req.body;

    // Validation
    if (!referenceId || !amount || !providerEmail || !candidateEmail) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: referenceId, amount, providerEmail, candidateEmail',
      });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0',
      });
      return;
    }

    // Check if reference exists
    const { data: reference, error: refError } = await supabase
      .from('references')
      .select('id, candidate_id, evaluator_id')
      .eq('id', referenceId)
      .single();

    if (refError || !reference) {
      res.status(404).json({
        success: false,
        error: 'Reference not found',
      });
      return;
    }

    // Create payment intent
    const processor = getPaymentProcessor();
    const paymentIntent = await processor.createPaymentIntent({
      referenceId,
      referenceProvider: providerEmail,
      candidate: candidateEmail,
      amount,
      payerEmail: req.body.payerEmail,
    });

    res.status(201).json({
      success: true,
      data: paymentIntent,
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment',
    });
  }
}

/**
 * GET /api/payments/status/:paymentId
 * Get payment status and details
 */
export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      res.status(400).json({
        success: false,
        error: 'Payment ID is required',
      });
      return;
    }

    const processor = getPaymentProcessor();
    const status = await processor.checkPaymentStatus(paymentId);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment status',
    });
  }
}

/**
 * GET /api/payments/history
 * Get payment history for current user
 */
export async function getPaymentHistory(req: Request, res: Response): Promise<void> {
  try {
    // Get user ID from auth middleware
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Get user's wallet address
    const { data: user } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('id', userId)
      .single();

    if (!user || !user.wallet_address) {
      res.status(404).json({
        success: false,
        error: 'User wallet not found',
      });
      return;
    }

    // Query payments involving this user
    const { data: payments, error } = await supabase
      .from('payment_summaries')
      .select('*')
      .or(
        `payer_address.eq.${user.wallet_address},` +
        `provider_address.eq.${user.wallet_address},` +
        `candidate_address.eq.${user.wallet_address}`
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: payments || [],
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment history',
    });
  }
}

/**
 * GET /api/payments/stats
 * Get payment statistics
 */
export async function getPaymentStats(req: Request, res: Response): Promise<void> {
  try {
    const { timeframe } = req.query;
    const validTimeframes = ['24h', '7d', '30d'];
    const period = validTimeframes.includes(timeframe as string)
      ? (timeframe as '24h' | '7d' | '30d')
      : '24h';

    const processor = getPaymentProcessor();
    const stats = await processor.getPaymentStats(period);

    // Also get bridge stats if XRP bridge is active
    const bridge = getXRPBridge();
    const bridgeStats = await bridge.getBridgeStats(period);

    res.status(200).json({
      success: true,
      data: {
        payments: stats,
        crossBorder: bridgeStats,
        timeframe: period,
      },
    });
  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment stats',
    });
  }
}

/**
 * POST /api/payments/cross-border
 * Initiate cross-border payment via XRP bridge
 */
export async function createCrossBorderPayment(req: Request, res: Response): Promise<void> {
  try {
    const { referenceId, amount, fromCountry, toCountry, recipientAddress } = req.body;

    // Validation
    if (!referenceId || !amount || !fromCountry || !toCountry || !recipientAddress) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
      return;
    }

    const bridge = getXRPBridge();

    // Check if bridge should be used
    const params = {
      referenceId,
      amountRLUSD: amount,
      fromCountry,
      toCountry,
      recipientAddress,
    };

    if (!bridge.shouldUseBridge(params)) {
      res.status(400).json({
        success: false,
        error: 'Payment does not meet cross-border criteria (min $1000, supported countries)',
      });
      return;
    }

    // Execute cross-border payment
    const result = await bridge.executeCrossBorderPayment(params);

    if (result.status === 'failed') {
      res.status(500).json({
        success: false,
        error: result.error || 'Cross-border payment failed',
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Create cross-border payment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process cross-border payment',
    });
  }
}

/**
 * GET /api/payments/user-stats/:walletAddress
 * Get payment statistics for a specific user
 */
export async function getUserPaymentStats(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
      return;
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_user_payment_stats', {
      user_wallet: walletAddress,
    });

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data || {
        total_received: 0,
        total_paid: 0,
        payment_count: 0,
        avg_payment: 0,
      },
    });
  } catch (error) {
    console.error('Get user payment stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user payment stats',
    });
  }
}

/**
 * POST /api/payments/webhook
 * Handle payment confirmation webhooks (from blockchain event listener)
 */
export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Verify webhook signature (implement proper verification in production)
    const signature = req.headers['x-webhook-signature'];
    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing webhook signature',
      });
      return;
    }

    const { eventType, paymentData } = req.body;

    if (eventType === 'payment_processed') {
      // Payment was confirmed on-chain
      // This would typically trigger additional actions like:
      // - Unlocking reference data
      // - Sending notifications
      // - Updating analytics

      console.log('Payment processed webhook received:', paymentData);

      res.status(200).json({
        success: true,
        message: 'Webhook processed',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Unknown event type',
      });
    }
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process webhook',
    });
  }
}
