'use client';

import { useState, useCallback } from 'react';
import { apiPost, apiGet } from '@/lib/apiClient';

type WalletData = {
  id: string;
  address: string;
  provider: 'coinbase_smart_wallet' | 'external';
  chain: string;
  created_at: string;
};

type WalletSetupProps = {
  onWalletConnected?: (wallet: WalletData) => void;
  onError?: (error: string) => void;
};

type ConnectState = 'idle' | 'connecting' | 'success' | 'error';

const WalletSetup = ({ onWalletConnected, onError }: WalletSetupProps) => {
  const [state, setState] = useState<ConnectState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<WalletData | null>(null);

  const handleError = useCallback((message: string) => {
    setError(message);
    setState('error');
    onError?.(message);
  }, [onError]);

  const handleCreateSmartWallet = useCallback(async () => {
    setState('connecting');
    setError(null);

    try {
      // For Coinbase Smart Wallet, we need to use their SDK
      // This is a placeholder - actual implementation requires @coinbase/onchainkit
      if (typeof window !== 'undefined' && (window as any).coinbaseWalletSDK) {
        const sdk = (window as any).coinbaseWalletSDK;
        const provider = sdk.makeWeb3Provider();
        const accounts = await provider.request({ method: 'eth_requestAccounts' });

        if (accounts && accounts.length > 0) {
          const address = accounts[0];

          const response = await apiPost<{ success: boolean; wallet: WalletData }>('/api/wallets/connect', {
            provider: 'coinbase_smart_wallet',
            address,
            chain: 'base'
          });

          if (response.success && response.wallet) {
            setConnectedWallet(response.wallet);
            setState('success');
            onWalletConnected?.(response.wallet);
          } else {
            handleError('Failed to connect wallet');
          }
        }
      } else {
        // Fallback: For demo purposes, show instructions
        handleError('Coinbase Wallet SDK not available. Please install Coinbase Wallet extension.');
      }
    } catch (err: any) {
      handleError(err.message || 'Failed to create smart wallet');
    }
  }, [onWalletConnected, handleError]);

  const handleConnectExternal = useCallback(async () => {
    setState('connecting');
    setError(null);

    try {
      // Check for MetaMask or other injected provider
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const ethereum = (window as any).ethereum;

        // Request account access
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

        if (accounts && accounts.length > 0) {
          const address = accounts[0];

          // Create a message to sign for ownership verification
          const message = `Connect wallet to HRKey\n\nAddress: ${address}\nTimestamp: ${Date.now()}`;

          // Request signature
          const signature = await ethereum.request({
            method: 'personal_sign',
            params: [message, address]
          });

          // Connect wallet via API
          const response = await apiPost<{ success: boolean; wallet: WalletData }>('/api/wallets/connect', {
            provider: 'external',
            address,
            chain: 'base',
            signed_message: message,
            signature
          });

          if (response.success && response.wallet) {
            setConnectedWallet(response.wallet);
            setState('success');
            onWalletConnected?.(response.wallet);
          } else {
            handleError('Failed to connect wallet');
          }
        }
      } else {
        handleError('No wallet detected. Please install MetaMask or another Web3 wallet.');
      }
    } catch (err: any) {
      if (err.code === 4001) {
        handleError('Connection cancelled by user');
      } else {
        handleError(err.message || 'Failed to connect wallet');
      }
    }
  }, [onWalletConnected, handleError]);

  const resetState = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  if (state === 'success' && connectedWallet) {
    return (
      <div className="wallet-setup wallet-connected">
        <div className="wallet-success">
          <span className="wallet-icon">&#x2714;</span>
          <h3>Wallet Connected</h3>
          <p className="wallet-address">
            {connectedWallet.address.slice(0, 6)}...{connectedWallet.address.slice(-4)}
          </p>
          <p className="wallet-provider">
            {connectedWallet.provider === 'coinbase_smart_wallet' ? 'Coinbase Smart Wallet' : 'External Wallet'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-setup">
      <h3>Connect Your Wallet</h3>
      <p className="wallet-description">
        Connect a wallet to anchor your identity on HRKey. No funds required.
      </p>

      {error && (
        <div className="wallet-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={resetState} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      <div className="wallet-options">
        <button
          type="button"
          onClick={handleCreateSmartWallet}
          disabled={state === 'connecting'}
          className="wallet-btn wallet-btn-primary"
        >
          {state === 'connecting' ? 'Connecting...' : 'Create Smart Wallet'}
        </button>

        <button
          type="button"
          onClick={handleConnectExternal}
          disabled={state === 'connecting'}
          className="wallet-btn wallet-btn-secondary"
        >
          {state === 'connecting' ? 'Connecting...' : 'Connect Existing Wallet'}
        </button>
      </div>

      <p className="wallet-note">
        Smart Wallets are powered by Coinbase. External wallets require signature verification.
      </p>
    </div>
  );
};

export default WalletSetup;
