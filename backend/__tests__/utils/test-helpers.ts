/**
 * Test Helper Functions
 *
 * Reusable utilities for tests:
 * - Create test users
 * - Create test wallets
 * - Generate mock blockchain events
 * - Clean up test data
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export async function createTestUser(params?: {
  email?: string;
  password?: string;
  fullName?: string;
}) {
  const email = params?.email || `test-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`;
  const password = params?.password || 'TestPassword123!';
  const fullName = params?.fullName || 'Test User';

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) throw error;

  return {
    id: data.user.id,
    email: data.user.email!,
    fullName,
  };
}

export async function createTestWallet(
  userId: string,
  type: 'custodial' | 'non_custodial' = 'custodial'
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const walletAddress =
    type === 'custodial'
      ? '0x' + randomBytes(20).toString('hex')
      : '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6';

  const { data, error } = await supabase
    .from('user_wallets')
    .insert({
      user_id: userId,
      wallet_address: walletAddress,
      wallet_type: type,
      network: 'base_sepolia',
      is_primary: true,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function cleanupTestUser(userId: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Delete user's wallets
  await supabase.from('user_wallets').delete().eq('user_id', userId);

  // Delete user's notifications
  await supabase.from('notifications').delete().eq('user_id', userId);

  // Delete user
  await supabase.auth.admin.deleteUser(userId);
}

export function generateMockPaymentEvent() {
  return {
    referenceId: 'ref-' + randomBytes(8).toString('hex'),
    payer: '0x' + randomBytes(20).toString('hex'),
    referenceProvider: '0x' + randomBytes(20).toString('hex'),
    candidate: '0x' + randomBytes(20).toString('hex'),
    totalAmount: BigInt('100000000'), // 100 RLUSD (6 decimals)
    split: {
      referenceProvider: '0x' + randomBytes(20).toString('hex'),
      candidate: '0x' + randomBytes(20).toString('hex'),
      treasury: '0x' + randomBytes(20).toString('hex'),
      stakingPool: '0x' + randomBytes(20).toString('hex'),
      providerAmount: BigInt('60000000'), // 60 RLUSD
      candidateAmount: BigInt('20000000'), // 20 RLUSD
      treasuryAmount: BigInt('15000000'), // 15 RLUSD
      stakingAmount: BigInt('5000000'), // 5 RLUSD
    },
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    txHash: '0x' + randomBytes(32).toString('hex'),
    blockNumber: Math.floor(Math.random() * 1000000),
  };
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a valid Ethereum address
 */
export function generateEthAddress(): string {
  return '0x' + randomBytes(20).toString('hex');
}

/**
 * Generate a valid transaction hash
 */
export function generateTxHash(): string {
  return '0x' + randomBytes(32).toString('hex');
}

/**
 * Mock Supabase response
 */
export function mockSupabaseResponse<T>(data: T, error: any = null) {
  return {
    data,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  };
}

/**
 * Mock successful Supabase query
 */
export function mockSuccessResponse<T>(data: T) {
  return mockSupabaseResponse(data, null);
}

/**
 * Mock failed Supabase query
 */
export function mockErrorResponse(message: string, code?: string) {
  return mockSupabaseResponse(null, {
    message,
    code: code || 'PGRST_ERROR',
  });
}
