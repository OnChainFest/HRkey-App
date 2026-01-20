/**
 * Mock Data Factory
 *
 * Pre-defined test data for consistent testing
 */

export const mockUsers = {
  provider: {
    id: 'user-provider-test-123',
    email: 'provider@test.example.com',
    full_name: 'John Provider',
  },
  candidate: {
    id: 'user-candidate-test-456',
    email: 'candidate@test.example.com',
    full_name: 'Jane Candidate',
  },
  employer: {
    id: 'user-employer-test-789',
    email: 'employer@test.example.com',
    full_name: 'Employer Corp',
  },
};

export const mockWallets = {
  custodial: {
    id: 'wallet-custodial-123',
    user_id: mockUsers.provider.id,
    wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
    wallet_type: 'custodial' as const,
    network: 'base_sepolia' as const,
    is_primary: true,
    created_at: new Date().toISOString(),
  },
  metamask: {
    id: 'wallet-metamask-456',
    user_id: mockUsers.candidate.id,
    wallet_address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    wallet_type: 'non_custodial' as const,
    network: 'base_sepolia' as const,
    is_primary: true,
    created_at: new Date().toISOString(),
  },
};

export const mockNotifications = {
  paymentReceived: {
    type: 'payment_received' as const,
    title: '💰 Payment Received!',
    message: 'You received 60 RLUSD for your verified reference',
    data: {
      amount: 60,
      txHash: '0xabc123def456789012345678901234567890123456789012345678901234',
      referenceId: 'ref-abc123',
      payment_id: 'pay-123',
    },
  },
  paymentPending: {
    type: 'payment_pending' as const,
    title: '⏳ Payment Pending',
    message: 'Waiting for payment confirmation',
    data: {
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      payment_id: 'pay-pending-123',
    },
  },
  paymentFailed: {
    type: 'payment_failed' as const,
    title: '❌ Payment Failed',
    message: 'Payment could not be processed',
    data: {
      amount: 100,
      reason: 'Insufficient balance',
      payment_id: 'pay-failed-123',
    },
  },
  walletCreated: {
    type: 'wallet_created' as const,
    title: '✅ Wallet Created Successfully',
    message: 'Your HRKey wallet is ready to receive payments',
    data: {
      walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
    },
  },
  referenceVerified: {
    type: 'reference_verified' as const,
    title: '✓ Reference Verified',
    message: 'Your reference has been successfully verified',
    data: {
      referenceId: 'ref-verified-123',
      providerName: 'John Provider',
    },
  },
};

export const mockReferences = {
  pending: {
    id: 'ref-pending-123',
    status: 'pending',
    evaluator_id: mockUsers.provider.id,
    owner_id: mockUsers.candidate.id,
    created_at: new Date().toISOString(),
  },
  verified: {
    id: 'ref-verified-456',
    status: 'verified',
    evaluator_id: mockUsers.provider.id,
    owner_id: mockUsers.candidate.id,
    payment_id: 'pay-123',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
    verified_at: new Date().toISOString(),
  },
};

export const mockPayments = {
  pending: {
    id: 'pay-pending-123',
    reference_id: mockReferences.pending.id,
    total_amount: '100000000', // 100 RLUSD (6 decimals)
    total_amount_usd: 100,
    status: 'pending',
    created_at: new Date().toISOString(),
  },
  completed: {
    id: 'pay-completed-456',
    reference_id: mockReferences.verified.id,
    total_amount: '100000000',
    total_amount_usd: 100,
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    block_number: 123456,
    status: 'completed',
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
  },
};

export const mockBalances = {
  withRLUSD: {
    rlusd: '100000000', // 100 RLUSD raw
    rlusd_formatted: '100.00',
    eth: '1000000000000000000', // 1 ETH raw
    eth_formatted: '1.00',
  },
  empty: {
    rlusd: '0',
    rlusd_formatted: '0.00',
    eth: '0',
    eth_formatted: '0.00',
  },
  lowETH: {
    rlusd: '100000000',
    rlusd_formatted: '100.00',
    eth: '100000000000000', // 0.0001 ETH
    eth_formatted: '0.0001',
  },
};

/**
 * Generate a complete notification object
 */
export function createMockNotification(
  userId: string,
  type: keyof typeof mockNotifications = 'paymentReceived'
) {
  const template = mockNotifications[type];
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    user_id: userId,
    type: template.type,
    title: template.title,
    message: template.message,
    data: template.data,
    read: false,
    archived: false,
    created_at: new Date().toISOString(),
  };
}

/**
 * Generate a complete wallet object
 */
export function createMockWallet(
  userId: string,
  type: 'custodial' | 'non_custodial' = 'custodial'
) {
  const address = `0x${Math.random().toString(16).substring(2, 42).padStart(40, '0')}`;
  return {
    id: `wallet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    user_id: userId,
    wallet_address: address,
    wallet_type: type,
    network: 'base_sepolia' as const,
    is_primary: true,
    created_at: new Date().toISOString(),
  };
}

/**
 * Generate a complete payment object
 */
export function createMockPayment(referenceId: string, status: 'pending' | 'completed' | 'failed' = 'completed') {
  return {
    id: `pay-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    reference_id: referenceId,
    total_amount: '100000000',
    total_amount_usd: 100,
    tx_hash: status === 'completed' ? `0x${Math.random().toString(16).substring(2).padStart(64, '0')}` : null,
    block_number: status === 'completed' ? Math.floor(Math.random() * 1000000) : null,
    status,
    created_at: new Date().toISOString(),
    paid_at: status === 'completed' ? new Date().toISOString() : null,
  };
}
