"use client";

/**
 * Wallet Dashboard Page
 *
 * Comprehensive wallet management interface for HRKey users:
 * - Wallet balance and information
 * - Payment transaction history
 * - Wallet setup flow if no wallet exists
 *
 * Route: /wallet
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { apiGet } from '@/lib/apiClient';
import WalletBalance from '@/components/wallet/WalletBalance';
import PaymentHistory from '@/components/wallet/PaymentHistory';
import WalletSetup from '@/components/wallet/WalletSetup';
import Alert from '@/components/ui/Alert';

export default function WalletPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  /**
   * Check authentication status
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !sessionData.session) {
          setIsAuthenticated(false);
          router.push('/login');
          return;
        }

        setIsAuthenticated(true);

        // Check if user has a wallet
        try {
          const response = await apiGet<{ success: boolean; wallet: any }>('/api/wallet/me');
          setHasWallet(response.success && !!response.wallet);
        } catch (err: any) {
          if (err.status === 404) {
            setHasWallet(false);
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setIsAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  /**
   * Handle wallet setup completion
   */
  const handleWalletSetupComplete = (walletAddress: string) => {
    console.log('Wallet setup completed:', walletAddress);
    setHasWallet(true);
    setShowSetup(false);
    // Refresh the page to show wallet data
    window.location.reload();
  };

  /**
   * Show wallet setup flow
   */
  const handleSetupWallet = () => {
    setShowSetup(true);
  };

  // Loading state
  if (checkingAuth) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated (should redirect)
  if (!isAuthenticated) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Alert variant="error">
          Please sign in to access your wallet.
        </Alert>
      </div>
    );
  }

  // Show wallet setup if no wallet and user clicked setup
  if (showSetup || (hasWallet === false && !showSetup)) {
    return (
      <WalletSetup
        onComplete={handleWalletSetupComplete}
        title="Set Up Your Payment Wallet"
        description="Connect or create a wallet to receive payments for your references on the Base network"
      />
    );
  }

  // Main wallet dashboard
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Wallet</h1>
        <p className="text-slate-600 mt-2">
          Manage your payment wallet and view transaction history
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="space-y-6">
        {/* Wallet Balance Section */}
        <div>
          <WalletBalance
            onSetupWallet={handleSetupWallet}
            showRefresh={true}
            autoRefresh={true}
            refreshInterval={30000} // Refresh every 30 seconds
          />
        </div>

        {/* Quick Actions (Optional - can add later) */}
        {hasWallet && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Add Funds Card */}
            <div className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900">Add RLUSD</h3>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Fund your wallet with RLUSD on Base network
              </p>
              <a
                href="https://www.coinbase.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Get RLUSD →
              </a>
            </div>

            {/* View on BaseScan Card */}
            <div className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900">View on BaseScan</h3>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                View your wallet on the blockchain explorer
              </p>
              <button
                onClick={() => {
                  // Get wallet address and open BaseScan
                  // This would need to be implemented with actual wallet address
                  window.open('https://sepolia.basescan.org/', '_blank');
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Open Explorer →
              </button>
            </div>

            {/* Security Card */}
            <div className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900">Security</h3>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Your wallet is securely encrypted and protected
              </p>
              <button
                onClick={() => router.push('/settings/security')}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Settings →
              </button>
            </div>
          </div>
        )}

        {/* Payment History Section */}
        <div>
          <PaymentHistory
            limit={10}
            showPagination={true}
          />
        </div>

        {/* Help Section */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-2">About Your Wallet</h3>
              <div className="text-sm text-slate-600 space-y-2">
                <p>
                  Your wallet is connected to the <strong>Base Sepolia testnet</strong>. This is a test network
                  where you can safely receive and manage payments.
                </p>
                <p>
                  Payments are automatically sent to your wallet when references are verified. You'll receive
                  notifications for all wallet activity.
                </p>
                <div className="mt-4">
                  <a
                    href="/help/wallet"
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Learn more about wallets →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
