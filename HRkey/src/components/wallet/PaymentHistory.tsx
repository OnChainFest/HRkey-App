"use client";

/**
 * PaymentHistory Component
 *
 * Displays user's payment transaction history:
 * - Received payments (as provider or candidate)
 * - Payment amounts and splits
 * - Transaction status
 * - Links to BaseScan explorer
 * - Pagination support
 *
 * Note: This component expects a backend endpoint to fetch payment data.
 * For now, it's designed to work with the payment structure from the database.
 */

import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/apiClient';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';

interface PaymentSplit {
  recipient_type: 'provider' | 'candidate' | 'treasury' | 'staking_pool';
  recipient_address: string;
  amount: string;
  amount_usd: number;
  percentage: number;
}

interface Payment {
  id: string;
  reference_id: string;
  total_amount: string;
  total_amount_usd: number;
  tx_hash: string;
  block_number: number;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
  splits?: PaymentSplit[];
  user_role?: 'provider' | 'candidate'; // Which role the current user played
  user_amount?: number; // Amount user received
}

interface PaymentHistoryResponse {
  success: boolean;
  payments: Payment[];
  pagination?: {
    total: number;
    offset: number;
    limit: number;
  };
}

interface PaymentHistoryProps {
  limit?: number;
  showPagination?: boolean;
  compact?: boolean;
}

export default function PaymentHistory({
  limit = 10,
  showPagination = true,
  compact = false,
}: PaymentHistoryProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  /**
   * Fetch payment history from backend
   */
  const fetchPayments = async (currentOffset: number = 0) => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Create this endpoint in the backend
      // For now, using a placeholder structure
      const response = await apiGet<PaymentHistoryResponse>('/api/payments/history', {
        query: {
          limit,
          offset: currentOffset,
        },
      });

      if (response.success) {
        setPayments(response.payments || []);
        setTotal(response.pagination?.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to fetch payment history:', err);
      if (err.status === 404 || err.status === 501) {
        // Endpoint not implemented yet - show empty state
        setPayments([]);
      } else {
        setError(err.message || 'Failed to load payment history');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments(offset);
  }, [offset]);

  /**
   * Format date for display
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Get BaseScan URL for transaction
   */
  const getBaseScanUrl = (txHash: string) => {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  };

  /**
   * Truncate transaction hash
   */
  const truncateTxHash = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  /**
   * Handle pagination
   */
  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card padding={compact ? 'sm' : 'md'}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-200 rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="error" dismissible onDismiss={() => setError(null)}>
        {error}
      </Alert>
    );
  }

  // Empty state
  if (payments.length === 0) {
    return (
      <Card padding={compact ? 'sm' : 'md'}>
        <div className="text-center py-8">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No Payments Yet</h3>
          <p className="text-slate-600 text-sm">
            Your payment history will appear here once you receive payments for references.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding={compact ? 'sm' : 'md'}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Payment History</h3>
        <p className="text-sm text-slate-600 mt-1">
          {total > 0 ? `${total} total payment${total !== 1 ? 's' : ''}` : 'Recent transactions'}
        </p>
      </div>

      {/* Payments List */}
      <div className="space-y-3">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-semibold text-slate-900">
                    {payment.user_role === 'provider' ? 'Reference Provider' : 'Candidate'}
                  </h4>
                  <Badge
                    variant={
                      payment.status === 'completed'
                        ? 'success'
                        : payment.status === 'pending'
                        ? 'warning'
                        : 'error'
                    }
                    size="sm"
                  >
                    {payment.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Reference #{payment.reference_id.slice(0, 8)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-700">
                  +${payment.user_amount?.toFixed(2) || payment.total_amount_usd.toFixed(2)}
                </div>
                <div className="text-xs text-slate-600">RLUSD</div>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-slate-500">Total:</span>{' '}
                  <span className="font-medium">${payment.total_amount_usd.toFixed(2)}</span>
                </div>
                {payment.user_role && (
                  <div>
                    <span className="text-slate-500">Your share:</span>{' '}
                    <span className="font-medium">
                      {payment.user_role === 'provider' ? '60%' : '20%'}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-slate-500">{formatDate(payment.created_at)}</div>
            </div>

            {/* Transaction Hash Link */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <a
                href={getBaseScanUrl(payment.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <span>TX: {truncateTxHash(payment.tx_hash)}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
              <div className="text-xs text-slate-500">Block #{payment.block_number}</div>
            </div>

            {/* Payment Splits (expandable section - optional) */}
            {payment.splits && payment.splits.length > 0 && (
              <details className="mt-3 pt-3 border-t border-slate-100">
                <summary className="text-xs font-medium text-slate-700 cursor-pointer hover:text-slate-900">
                  View Payment Split
                </summary>
                <div className="mt-2 space-y-1">
                  {payment.splits.map((split, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            split.recipient_type === 'provider'
                              ? 'indigo'
                              : split.recipient_type === 'candidate'
                              ? 'info'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {split.recipient_type}
                        </Badge>
                        <span className="text-slate-600 font-mono text-xs">
                          {split.recipient_address.slice(0, 6)}...{split.recipient_address.slice(-4)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-600">{split.percentage}%</span>
                        <span className="font-medium text-slate-900">
                          ${split.amount_usd.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {showPagination && total > limit && (
        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-sm text-slate-600">
            Showing {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handlePrevPage}
              disabled={offset === 0}
              className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={offset + limit >= total}
              className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
