"use client";

/**
 * WalletSetup Component
 *
 * Handles wallet onboarding for HRKey users with two options:
 * 1. Create Custodial Wallet - System generates and manages wallet
 * 2. Connect Existing Wallet - User connects MetaMask, Coinbase, or WalletConnect
 *
 * Integrates with:
 * - Backend wallet API (POST /api/wallet/setup)
 * - OnchainKit for Web3 wallet connections
 * - Existing HRKey design patterns
 */

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { apiPost } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';

type WalletType = 'custodial' | 'non_custodial';
type SetupStep = 'choose' | 'custodial_creating' | 'non_custodial_connecting' | 'success';

interface WalletSetupProps {
  onComplete?: (walletAddress: string) => void;
  onSkip?: () => void;
  showSkipButton?: boolean;
  title?: string;
  description?: string;
}

interface WalletSetupResponse {
  success: boolean;
  wallet: {
    wallet_address: string;
    wallet_type: string;
    network: string;
    created_at: string;
  };
  message?: string;
}

export default function WalletSetup({
  onComplete,
  onSkip,
  showSkipButton = false,
  title = "Set Up Your Wallet",
  description = "Connect a wallet to receive payments for your references"
}: WalletSetupProps) {
  const [step, setStep] = useState<SetupStep>('choose');
  const [error, setError] = useState<string | null>(null);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Wagmi hooks for non-custodial wallet connection
  const { address: connectedAddress, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError('Please sign in to set up your wallet');
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError('Failed to verify authentication');
        setIsAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Handle non-custodial wallet connection
  useEffect(() => {
    if (isConnected && connectedAddress && step === 'non_custodial_connecting') {
      handleLinkExistingWallet(connectedAddress);
    }
  }, [isConnected, connectedAddress, step]);

  /**
   * Create a custodial wallet managed by HRKey
   */
  const handleCreateCustodialWallet = async () => {
    setError(null);
    setStep('custodial_creating');

    try {
      const response = await apiPost<WalletSetupResponse>('/api/wallet/setup', {
        walletType: 'custodial',
      });

      if (response.success && response.wallet) {
        setCreatedWalletAddress(response.wallet.wallet_address);
        setStep('success');

        if (onComplete) {
          onComplete(response.wallet.wallet_address);
        }
      } else {
        throw new Error(response.message || 'Failed to create wallet');
      }
    } catch (err: any) {
      console.error('Custodial wallet creation failed:', err);
      setError(err.message || 'Failed to create wallet. Please try again.');
      setStep('choose');
    }
  };

  /**
   * Link an existing Web3 wallet (MetaMask, Coinbase, etc.)
   */
  const handleLinkExistingWallet = async (address: string) => {
    setError(null);

    try {
      const response = await apiPost<WalletSetupResponse>('/api/wallet/setup', {
        walletType: 'non_custodial',
        existingAddress: address,
        walletSource: 'metamask', // Could be enhanced to detect actual wallet type
      });

      if (response.success && response.wallet) {
        setCreatedWalletAddress(response.wallet.wallet_address);
        setStep('success');

        if (onComplete) {
          onComplete(response.wallet.wallet_address);
        }
      } else {
        throw new Error(response.message || 'Failed to connect wallet');
      }
    } catch (err: any) {
      console.error('Wallet linking failed:', err);
      setError(err.message || 'Failed to connect wallet. Please try again.');
      setStep('choose');
      disconnect(); // Disconnect on failure
    }
  };

  /**
   * Initiate non-custodial wallet connection
   */
  const handleConnectNonCustodial = () => {
    setError(null);
    setStep('non_custodial_connecting');

    // Get the first available connector (usually MetaMask or injected wallet)
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    } else {
      setError('No wallet connector found. Please install MetaMask or Coinbase Wallet.');
      setStep('choose');
    }
  };

  /**
   * Copy wallet address to clipboard
   */
  const handleCopyAddress = async () => {
    if (createdWalletAddress) {
      try {
        await navigator.clipboard.writeText(createdWalletAddress);
        // Could add a toast notification here
        alert('Wallet address copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  };

  // Loading state while checking authentication
  if (checkingAuth) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Card padding="md">
          <div className="text-center py-8">
            <div className="text-slate-600">Loading...</div>
          </div>
        </Card>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Alert variant="error" title="Authentication Required">
          Please sign in to set up your wallet.
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-slate-600 mt-2">{description}</p>
      </div>

      {error && (
        <div className="mb-6">
          <Alert variant="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {/* Step 1: Choose wallet type */}
      {step === 'choose' && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="space-y-6">
              {/* Custodial Option */}
              <div className="border border-slate-200 rounded-lg p-6 hover:border-indigo-300 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">
                      Create Managed Wallet
                    </h3>
                    <p className="text-sm text-slate-600">
                      We'll create and securely manage a wallet for you. Perfect if you're new to crypto.
                    </p>
                  </div>
                  <div className="ml-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Recommended
                    </span>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    No setup required
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Securely encrypted
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Instant setup
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleCreateCustodialWallet}
                >
                  Create Managed Wallet
                </Button>
              </div>

              {/* Non-Custodial Option */}
              <div className="border border-slate-200 rounded-lg p-6 hover:border-indigo-300 transition-colors">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    Connect Your Wallet
                  </h3>
                  <p className="text-sm text-slate-600">
                    Connect an existing wallet like MetaMask or Coinbase Wallet. You maintain full control.
                  </p>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Full control of your keys
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Use existing wallet
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <svg className="w-4 h-4 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Works with MetaMask, Coinbase
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={handleConnectNonCustodial}
                  loading={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              </div>
            </div>

            {showSkipButton && onSkip && (
              <div className="mt-6 text-center">
                <button
                  onClick={onSkip}
                  className="text-sm text-slate-600 hover:text-slate-900 underline"
                >
                  Skip for now
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Step 2: Creating custodial wallet */}
      {step === 'custodial_creating' && (
        <Card padding="md">
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100">
                <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Creating Your Wallet
            </h3>
            <p className="text-slate-600">
              Generating secure wallet and encrypting keys...
            </p>
          </div>
        </Card>
      )}

      {/* Step 3: Connecting non-custodial wallet */}
      {step === 'non_custodial_connecting' && (
        <Card padding="md">
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
                <svg className="animate-pulse h-8 w-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Connecting Your Wallet
            </h3>
            <p className="text-slate-600 mb-4">
              Please approve the connection request in your wallet extension
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStep('choose');
                disconnect();
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Success */}
      {step === 'success' && createdWalletAddress && (
        <Card variant="success" padding="md">
          <div className="text-center py-6">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-green-900 mb-2">
              Wallet Connected Successfully!
            </h3>
            <p className="text-green-800 mb-6">
              You're all set to receive payments for your references
            </p>

            <div className="bg-white border border-green-200 rounded-lg p-4 mb-6">
              <div className="text-sm font-medium text-slate-700 mb-2">Your Wallet Address</div>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <code className="text-sm text-slate-900 font-mono truncate">
                  {createdWalletAddress}
                </code>
                <button
                  onClick={handleCopyAddress}
                  className="ml-2 p-1 text-slate-600 hover:text-slate-900 focus:outline-none"
                  title="Copy address"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Network: Base Sepolia (Testnet)
              </div>
            </div>

            {onComplete && (
              <Button
                variant="primary"
                size="md"
                onClick={() => onComplete(createdWalletAddress)}
              >
                Continue to Dashboard
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
