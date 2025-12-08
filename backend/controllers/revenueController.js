// ============================================================================
// Revenue Controller
// ============================================================================
// Handles revenue sharing, earnings, and payout operations
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Check if Sentry is enabled
const isTest = process.env.NODE_ENV === 'test';
const sentryEnabled = !isTest && !!process.env.SENTRY_DSN;

// ============================================================================
// GET USER BALANCE
// ============================================================================

/**
 * GET /api/revenue/balance
 * Get current user's earnings balance
 */
export async function getUserBalance(req, res) {
  try {
    const userId = req.user.id;

    const { data: balance, error } = await supabaseClient
      .from('user_balance_ledger')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching balance:', error);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to fetch balance'
      });
    }

    if (!balance) {
      return res.json({
        success: true,
        balance: {
          totalEarned: 0,
          totalPaidOut: 0,
          currentBalance: 0,
          currency: 'USD',
          minPayoutThreshold: 50.00
        }
      });
    }

    return res.json({
      success: true,
      balance: {
        totalEarned: parseFloat(balance.total_earned),
        totalPaidOut: parseFloat(balance.total_paid_out),
        currentBalance: parseFloat(balance.current_balance),
        currency: balance.currency,
        minPayoutThreshold: parseFloat(balance.min_payout_threshold),
        preferredPayoutMethod: balance.preferred_payout_method,
        walletAddress: balance.wallet_address,
        lastPayoutAt: balance.last_payout_at
      }
    });
  } catch (error) {
    console.error('Get user balance error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET REVENUE SHARES
// ============================================================================

/**
 * GET /api/revenue/shares
 * Get all revenue shares for the current user
 *
 * Query params:
 *   - status: filter by status
 *   - limit: number of results (default 50)
 *   - offset: pagination offset (default 0)
 */
export async function getRevenueShares(req, res) {
  try {
    const userId = req.user.id;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabaseClient
      .from('revenue_shares')
      .select(`
        *,
        data_access_requests (
          id,
          requested_data_type,
          created_at
        ),
        companies (
          id,
          name,
          logo_url
        )
      `, { count: 'exact' })
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: shares, error, count } = await query;

    if (error) {
      console.error('Error fetching revenue shares:', error);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to fetch revenue shares'
      });
    }

    return res.json({
      success: true,
      shares: shares.map(share => ({
        id: share.id,
        requestId: share.data_access_request_id,
        company: share.companies,
        dataType: share.data_access_requests?.requested_data_type,
        totalAmount: parseFloat(share.total_amount),
        userAmount: parseFloat(share.user_amount),
        currency: share.currency,
        status: share.status,
        userPaid: share.user_paid,
        userPaidAt: share.user_paid_at,
        createdAt: share.created_at
      })),
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get revenue shares error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET TRANSACTION HISTORY
// ============================================================================

/**
 * GET /api/revenue/transactions
 * Get transaction history for the current user
 *
 * Query params:
 *   - type: filter by transaction type
 *   - limit: number of results (default 50)
 *   - offset: pagination offset (default 0)
 */
export async function getTransactionHistory(req, res) {
  try {
    const userId = req.user.id;
    const { type, limit = 50, offset = 0 } = req.query;

    let query = supabaseClient
      .from('revenue_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (type) {
      query = query.eq('transaction_type', type);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to fetch transactions'
      });
    }

    return res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.transaction_type,
        amount: parseFloat(tx.amount),
        currency: tx.currency,
        description: tx.description,
        balanceBefore: tx.balance_before ? parseFloat(tx.balance_before) : null,
        balanceAfter: tx.balance_after ? parseFloat(tx.balance_after) : null,
        externalTxId: tx.external_tx_id,
        paymentProvider: tx.payment_provider,
        createdAt: tx.created_at
      })),
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// REQUEST PAYOUT
// ============================================================================

/**
 * POST /api/revenue/payout/request
 * User requests a payout of their current balance
 *
 * Body: {
 *   amount?: number (optional, defaults to current balance),
 *   payoutMethod?: string ('wallet', 'stripe', 'bank_transfer')
 * }
 */
export async function requestPayout(req, res) {
  try {
    const userId = req.user.id;
    const { amount, payoutMethod = 'wallet' } = req.body;

    // Get current balance
    const { data: balance, error: balanceError } = await supabaseClient
      .from('user_balance_ledger')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (balanceError || !balance) {
      return res.status(404).json({
        error: 'Balance not found',
        message: 'No earnings balance found for this user'
      });
    }

    const currentBalance = parseFloat(balance.current_balance);
    const requestedAmount = amount ? parseFloat(amount) : currentBalance;

    // Validate amount
    if (requestedAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Payout amount must be greater than 0'
      });
    }

    if (requestedAmount > currentBalance) {
      return res.status(400).json({
        error: 'Insufficient balance',
        message: `Requested amount (${requestedAmount}) exceeds current balance (${currentBalance})`
      });
    }

    // Check minimum threshold
    const minThreshold = parseFloat(balance.min_payout_threshold);
    if (requestedAmount < minThreshold) {
      return res.status(400).json({
        error: 'Below minimum threshold',
        message: `Minimum payout amount is ${minThreshold} ${balance.currency}`
      });
    }

    // TODO: Implement actual payout processing
    // For now, we just create a pending payout record

    // Create transaction log
    const { data: transaction, error: txError } = await supabaseClient
      .from('revenue_transactions')
      .insert([{
        user_id: userId,
        user_email: balance.user_email,
        transaction_type: 'PAYOUT',
        amount: -requestedAmount, // Negative because it's going out
        currency: balance.currency,
        description: `Payout request via ${payoutMethod}`,
        balance_before: currentBalance,
        balance_after: currentBalance - requestedAmount,
        payment_provider: payoutMethod,
        metadata: {
          status: 'pending',
          payoutMethod,
          requestedAt: new Date().toISOString()
        }
      }])
      .select()
      .single();

    if (txError) {
      console.error('Error creating payout transaction:', txError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to create payout request'
      });
    }

    // Update balance (mark as pending withdrawal)
    // In production, only update after successful payout
    // For now, we keep it in current_balance until actually paid

    return res.json({
      success: true,
      message: 'Payout request created successfully',
      payout: {
        transactionId: transaction.id,
        amount: requestedAmount,
        currency: balance.currency,
        payoutMethod,
        status: 'pending',
        estimatedProcessingTime: '2-5 business days'
      }
    });
  } catch (error) {
    console.error('Request payout error:', error);

    // Capture payout errors in Sentry (critical - involves money)
    if (sentryEnabled) {
      Sentry.captureException(error, scope => {
        scope.setTag('controller', 'revenue');
        scope.setTag('route', 'POST /api/revenue/payout/request');
        scope.setTag('error_type', 'payout_error');
        scope.setContext('payout_request', {
          userId: req.user?.id,
          amount: req.body?.amount,
          payoutMethod: req.body?.payoutMethod
        });
        return scope;
      });
    }

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET EARNINGS SUMMARY
// ============================================================================

/**
 * GET /api/revenue/summary
 * Get earnings summary with statistics
 */
export async function getEarningsSummary(req, res) {
  try {
    const userId = req.user.id;

    // Get balance
    const { data: balance } = await supabaseClient
      .from('user_balance_ledger')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Get total number of approved requests
    const { count: approvedRequestsCount } = await supabaseClient
      .from('data_access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', userId)
      .eq('status', 'APPROVED');

    // Get total revenue shares
    const { data: revenueShares } = await supabaseClient
      .from('revenue_shares')
      .select('user_amount, status')
      .eq('target_user_id', userId);

    const totalFromShares = revenueShares?.reduce(
      (sum, share) => sum + parseFloat(share.user_amount),
      0
    ) || 0;

    const paidShares = revenueShares?.filter(s => s.user_paid).length || 0;
    const pendingShares = revenueShares?.filter(s => !s.user_paid).length || 0;

    return res.json({
      success: true,
      summary: {
        balance: {
          total: balance ? parseFloat(balance.total_earned) : 0,
          available: balance ? parseFloat(balance.current_balance) : 0,
          paidOut: balance ? parseFloat(balance.total_paid_out) : 0,
          currency: balance?.currency || 'USD'
        },
        stats: {
          totalApprovedRequests: approvedRequestsCount || 0,
          totalRevenueShares: revenueShares?.length || 0,
          paidShares,
          pendingShares,
          totalEarnedFromShares: totalFromShares
        },
        payoutInfo: {
          minThreshold: balance?.min_payout_threshold || 50.00,
          preferredMethod: balance?.preferred_payout_method || 'wallet',
          lastPayoutAt: balance?.last_payout_at || null
        }
      }
    });
  } catch (error) {
    console.error('Get earnings summary error:', error);

    // Capture earnings summary errors in Sentry
    if (sentryEnabled) {
      Sentry.captureException(error, scope => {
        scope.setTag('controller', 'revenue');
        scope.setTag('route', 'GET /api/revenue/summary');
        scope.setTag('error_type', 'summary_error');
        scope.setContext('summary_request', {
          userId: req.user?.id
        });
        return scope;
      });
    }

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  getUserBalance,
  getRevenueShares,
  getTransactionHistory,
  requestPayout,
  getEarningsSummary
};
