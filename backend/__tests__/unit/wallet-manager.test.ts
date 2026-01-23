import {  jest  } from '@jest/globals';
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

const mockWallet = {
  address: '0x52908400098527886E0F7030069857D2E4169EE7',
  privateKey: '0xprivkey'
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

await jest.unstable_mockModule('ethers', () => ({
  Wallet: {
    createRandom: jest.fn(() => mockWallet),
  },
  ethers: {
    Wallet: {
      createRandom: jest.fn(() => mockWallet),
    },
  },
}));

const { WalletCreationService } = await import('../../Wallet_Creation_Base_SDK.js');

describe('WalletCreationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing wallet when found', async () => {
    setTableResponses('user_wallets', {
      maybeSingleResponses: [
        mockSuccess({
          address: '0x0000000000000000000000000000000000000001',
          network: 'base-mainnet',
          wallet_type: 'custodial',
          created_at: '2024-01-01T00:00:00.000Z'
        })
      ]
    });

    const wallet = await WalletCreationService.createWalletForUser('user-1', 'user@example.com');

    expect(wallet.address).toBe('0x0000000000000000000000000000000000000001');
  });

  it('creates a new wallet when none exists', async () => {
    setTableResponses('user_wallets', {
      maybeSingleResponses: [mockSuccess(null)],
      singleResponses: [
        mockSuccess({
          address: mockWallet.address,
          network: 'base-mainnet',
          wallet_type: 'custodial',
          created_at: '2024-01-02T00:00:00.000Z'
        })
      ]
    });

    setTableResponses('user_plans', {
      insertResponses: [mockSuccess(null)]
    });

    const wallet = await WalletCreationService.createWalletForUser('user-2', 'user2@example.com');

    expect(wallet.address).toBe(mockWallet.address);
    expect(wallet.walletType).toBe('custodial');
  });
});
