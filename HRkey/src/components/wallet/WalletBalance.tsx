"use client";

/**
 * WalletBalance Component
 *
 * Displays user's wallet information and balances:
 * - Wallet address with copy functionality
 * - RLUSD balance (payment token)
 * - ETH balance (gas token)
 * - Network indicator
 * - Refresh button
 *
 * Fetches data from GET /api/wallet/me endpoint
 */

import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/apiClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';

interface WalletInfo {
  wallet_address: string;
  wallet_type: 'custodial' | 'non_custodial';
  network: string;
  balance: {
    rlusd: string;
    rlusd_formatted: string;
    eth: string;
    eth_formatted: string;
  };
  created_at: string;
}

interface WalletBalanceResponse {
  success: boolean;
  wallet: WalletInfo;
  message?: string;
}

interface WalletBalanceProps {
  onSetupWallet?: () => void;
  compact?: boolean;
  showRefresh?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

export default function WalletBalance({
  onSetupWallet,
  compact = false,
  showRefresh = true,
  autoRefresh = false,
  refreshInterval = 30000, // 30 seconds default
}: WalletBalanceProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  /**
   * Fetch wallet data from backend
   */
  const fetchWalletData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiGet<WalletBalanceResponse>('/api/wallet/me');

      if (response.success && response.wallet) {
        setWallet(response.wallet);
      } else {
        // No wallet found - user needs to set up
        setWallet(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch wallet:', err);
      if (err.status === 404) {
        // No wallet exists - this is OK
        setWallet(null);
      } else {
        setError(err.message || 'Failed to load wallet data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchWalletData();
  }, []);

  // Auto-refresh if enabled
  useEffect(() => {
    if (autoRefresh && wallet) {
      const interval = setInterval(() => {
        fetchWalletData(true);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, wallet, refreshInterval]);

  /**
   * Copy wallet address to clipboard
   */
  const handleCopyAddress = async () => {
    if (wallet?.wallet_address) {
      try {
        await navigator.clipboard.writeText(wallet.wallet_address);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  };

  /**
   * Truncate wallet address for display
   */
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * Format network name for display
   */
  const formatNetwork = (network: string) => {
    if (network === 'base_sepolia') return 'Base Sepolia';
    if (network === 'base_mainnet') return 'Base Mainnet';
    return network;
  };

  // Loading state
  if (loading) {
    return (
      <Card padding={compact ? 'sm' : 'md'}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          <div className="h-8 bg-slate-200 rounded"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </div>
      </Card>
    );
  }

  // No wallet - show setup prompt
  if (!wallet) {
    return (
      <Card variant="info" padding={compact ? 'sm' : 'md'}>
        <div className="text-center py-4">
          <div className="mb-2">
            <svg
              className="mx-auto h-12 w-12 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-blue-900 mb-1">
            No Wallet Connected
          </h3>
          <p className="text-sm text-blue-800 mb-4">
            Set up a wallet to receive payments for your references
          </p>
          {onSetupWallet && (
            <Button variant="primary" size="sm" onClick={onSetupWallet}>
              Set Up Wallet
            </Button>
          )}
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

  // Compact view (for navbar or small spaces)
  if (compact) {
    return (
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-sm font-mono text-slate-700">
            {truncateAddress(wallet.wallet_address)}
          </span>
        </div>
        <div className="text-sm font-semibold text-slate-900">
          {wallet.balance.rlusd_formatted} RLUSD
        </div>
      </div>
    );
  }

  // Full view
  return (
    <Card padding="md">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Your Wallet</h3>
          <div className="flex items-center space-x-2">
            <Badge variant={wallet.wallet_type === 'custodial' ? 'indigo' : 'info'} size="sm">
              {wallet.wallet_type === 'custodial' ? 'Managed' : 'Connected'}
            </Badge>
            <Badge variant="neutral" size="sm">
              {formatNetwork(wallet.network)}
            </Badge>
          </div>
        </div>
        {showRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchWalletData(true)}
            loading={refreshing}
            disabled={refreshing}
          >
            <svg
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </Button>
        )}
      </div>

      {/* Wallet Address */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-600 mb-1">Address</div>
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <code className="text-sm text-slate-900 font-mono truncate">
            {wallet.wallet_address}
          </code>
          <button
            onClick={handleCopyAddress}
            className="ml-2 p-1 text-slate-600 hover:text-slate-900 focus:outline-none transition-colors"
            title="Copy address"
          >
            {copySuccess ? (
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        {/* RLUSD Balance */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-orange-800">RLUSD</div>
            <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">$</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-orange-900">
            {wallet.balance.rlusd_formatted}
          </div>
          <div className="text-xs text-orange-700 mt-1">Payment Token</div>
        </div>

        {/* ETH Balance */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-indigo-800">ETH</div>
            <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">Ξ</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-900">
            {wallet.balance.eth_formatted}
          </div>
          <div className="text-xs text-indigo-700 mt-1">Gas Token</div>
        </div>
      </div>

      {/* Low ETH Warning */}
      {parseFloat(wallet.balance.eth) < 0.001 && (
        <div className="mt-4">
          <Alert variant="warning" title="Low ETH Balance">
            <p className="text-sm">
              You may need ETH for transaction fees. Consider adding some ETH to your wallet.
            </p>
          </Alert>
        </div>
      )}
    </Card>
  );
}
