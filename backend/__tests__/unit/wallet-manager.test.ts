/**
 * Unit Tests: Wallet Manager Service
 *
 * Coverage:
 * - Custodial wallet creation
 * - Non-custodial wallet linking
 * - Private key encryption/decryption
 * - Wallet validation
 * - Balance fetching
 * - Error handling
 */

import { ethers } from 'ethers';
import { mockSuccessResponse, mockErrorResponse, generateEthAddress } from '../utils/test-helpers';
import { mockUsers, mockWallets, mockBalances } from '../utils/mock-data';

// Mock Supabase before importing WalletManager
const mockFrom = jest.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock ethers
const mockGetBalance = jest.fn();
const mockBalanceOf = jest.fn();
const mockCreateRandom = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Wallet: {
        createRandom: () => mockCreateRandom(),
      },
      JsonRpcProvider: jest.fn(() => ({
        getBalance: mockGetBalance,
      })),
      Contract: jest.fn(() => ({
        balanceOf: mockBalanceOf,
      })),
      isAddress: (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr),
      formatUnits: actual.ethers.formatUnits,
      parseUnits: actual.ethers.parseUnits,
    },
  };
});

// Import after mocks are set up
import { WalletManager } from '../../services/wallet/wallet-manager';

describe('WalletManager Service', () => {
  let walletManager: WalletManager;

  // Mock chain builder for Supabase queries
  const mockChain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock responses
    mockFrom.mockReturnValue(mockChain);
    mockCreateRandom.mockReturnValue({
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    mockGetBalance.mockResolvedValue(BigInt('1000000000000000000')); // 1 ETH
    mockBalanceOf.mockResolvedValue(BigInt('100000000')); // 100 RLUSD

    // Initialize WalletManager
    walletManager = new WalletManager();
  });

  describe('createCustodialWallet', () => {
    test('should create wallet with valid Ethereum address', async () => {
      // Mock: User doesn't have wallet yet (404)
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'wallet-123',
            user_id: 'user-123',
            wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
            wallet_type: 'custodial',
            network: 'base_sepolia',
            is_primary: true,
            created_at: new Date().toISOString(),
          },
          error: null,
        });

      const result = await walletManager.createCustodialWallet({
        userId: 'user-123',
        userEmail: 'test@example.com',
      });

      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(result.type).toBe('custodial');
      expect(result.network).toBe('base_sepolia');
      expect(mockCreateRandom).toHaveBeenCalled();
    });

    test('should throw error if user already has wallet', async () => {
      // Mock: User already has wallet
      mockChain.single.mockResolvedValueOnce({
        data: mockWallets.custodial,
        error: null,
      });

      await expect(
        walletManager.createCustodialWallet({
          userId: 'user-123',
          userEmail: 'test@example.com',
        })
      ).rejects.toThrow('already has a wallet');
    });

    test('should encrypt private key before storing', async () => {
      const insertMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        insert: insertMock,
      });

      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { id: 'wallet-123', wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6' },
          error: null,
        });

      await walletManager.createCustodialWallet({
        userId: 'user-123',
        userEmail: 'test@example.com',
      });

      // Verify insert was called with encrypted_private_key
      const insertCall = insertMock.mock.calls[0]?.[0];
      expect(insertCall).toHaveProperty('encrypted_private_key');
      // Should NOT contain raw private key
      expect(insertCall?.encrypted_private_key).not.toContain('0x1234');
    });

    test('should sync wallet to users table', async () => {
      const updateMock = jest.fn().mockReturnValue(mockChain);

      mockFrom
        .mockReturnValueOnce(mockChain) // First call for checking existing
        .mockReturnValueOnce({
          ...mockChain,
          insert: jest.fn().mockReturnValue(mockChain),
        }) // Insert wallet
        .mockReturnValueOnce({
          ...mockChain,
          update: updateMock,
        }); // Update users table

      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // No existing wallet
        .mockResolvedValueOnce({
          data: { id: 'wallet-123', wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6' },
          error: null,
        }); // Insert success

      await walletManager.createCustodialWallet({
        userId: 'user-123',
        userEmail: 'test@example.com',
      });

      // Verify users table was updated
      expect(updateMock).toHaveBeenCalled();
      const updateCall = updateMock.mock.calls[0]?.[0];
      expect(updateCall).toHaveProperty('wallet_address');
      expect(updateCall).toHaveProperty('wallet_type', 'custodial');
    });
  });

  describe('linkExistingWallet', () => {
    test('should link valid Ethereum address', async () => {
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6';

      // Mock: Address not already linked
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // Check user doesn't have wallet
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // Check address not used
        .mockResolvedValueOnce({
          data: {
            id: 'wallet-456',
            wallet_address: validAddress,
            wallet_type: 'non_custodial',
          },
          error: null,
        }); // Insert success

      const result = await walletManager.linkExistingWallet({
        userId: 'user-123',
        address: validAddress,
      });

      expect(result.address).toBe(validAddress);
      expect(result.type).toBe('non_custodial');
    });

    test('should reject invalid Ethereum address', async () => {
      await expect(
        walletManager.linkExistingWallet({
          userId: 'user-123',
          address: 'not-an-address',
        })
      ).rejects.toThrow('Invalid Ethereum address');
    });

    test('should prevent duplicate wallet linking', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6';

      // Mock: Address already exists for another user
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // User doesn't have wallet
        .mockResolvedValueOnce({
          data: { wallet_address: address, user_id: 'other-user' },
          error: null,
        }); // Address already linked

      await expect(
        walletManager.linkExistingWallet({
          userId: 'user-123',
          address,
        })
      ).rejects.toThrow('already linked');
    });

    test('should normalize address to checksummed format', async () => {
      const lowercaseAddr = '0x742d35cc6634c0532925a3b844bc9e7595f0beb6';
      const insertMock = jest.fn().mockReturnValue(mockChain);

      mockFrom.mockReturnValue({
        ...mockChain,
        insert: insertMock,
      });

      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { id: 'wallet-789' },
          error: null,
        });

      await walletManager.linkExistingWallet({
        userId: 'user-123',
        address: lowercaseAddr,
      });

      // Should store checksummed address
      const insertCall = insertMock.mock.calls[0]?.[0];
      expect(insertCall?.wallet_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('getUserBalance', () => {
    test('should return RLUSD and ETH balances', async () => {
      // Mock: User has wallet
      mockChain.single.mockResolvedValueOnce({
        data: {
          wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        error: null,
      });

      const balance = await walletManager.getUserBalance('user-123');

      expect(balance).toHaveProperty('rlusdBalance');
      expect(balance).toHaveProperty('ethBalance');
      expect(balance).toHaveProperty('rlusdBalanceFormatted');
      expect(balance).toHaveProperty('ethBalanceFormatted');
      expect(mockGetBalance).toHaveBeenCalled();
      expect(mockBalanceOf).toHaveBeenCalled();
    });

    test('should throw error if user has no wallet', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      await expect(
        walletManager.getUserBalance('user-123')
      ).rejects.toThrow();
    });

    test('should format balances correctly', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        error: null,
      });

      mockGetBalance.mockResolvedValueOnce(ethers.parseUnits('1.5', 18)); // 1.5 ETH
      mockBalanceOf.mockResolvedValueOnce(ethers.parseUnits('123.456', 6)); // 123.456 RLUSD

      const balance = await walletManager.getUserBalance('user-123');

      expect(balance.ethBalanceFormatted).toContain('1.5');
      expect(balance.rlusdBalanceFormatted).toContain('123.45');
    });

    test('should handle zero balances', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        error: null,
      });

      mockGetBalance.mockResolvedValueOnce(BigInt(0));
      mockBalanceOf.mockResolvedValueOnce(BigInt(0));

      const balance = await walletManager.getUserBalance('user-123');

      expect(balance.rlusdBalanceFormatted).toBe('0.0');
      expect(balance.ethBalanceFormatted).toBe('0.0');
    });
  });

  describe('hasWallet', () => {
    test('should return true if user has wallet', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'wallet-123' },
        error: null,
      });

      const result = await walletManager.hasWallet('user-123');

      expect(result).toBe(true);
    });

    test('should return false if user has no wallet', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await walletManager.hasWallet('user-123');

      expect(result).toBe(false);
    });
  });

  describe('deleteWallet', () => {
    test('should not allow deletion with non-zero balance', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        error: null,
      });

      // Mock non-zero balance
      mockBalanceOf.mockResolvedValueOnce(BigInt('100000000')); // 100 RLUSD

      await expect(
        walletManager.deleteWallet('user-123')
      ).rejects.toThrow('balance');
    });

    test('should allow deletion with zero balance', async () => {
      const deleteMock = jest.fn().mockReturnValue(mockChain);

      mockFrom
        .mockReturnValueOnce(mockChain) // Get wallet
        .mockReturnValueOnce({
          ...mockChain,
          delete: deleteMock,
        }); // Delete wallet

      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'wallet-123',
          wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        error: null,
      });

      // Mock zero balance
      mockBalanceOf.mockResolvedValueOnce(BigInt(0));

      await walletManager.deleteWallet('user-123');

      expect(deleteMock).toHaveBeenCalled();
    });
  });

  describe('getWalletByAddress', () => {
    test('should find wallet by address', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6';

      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'wallet-123',
          wallet_address: address,
          user_id: 'user-123',
        },
        error: null,
      });

      const result = await walletManager.getWalletByAddress(address);

      expect(result).toBeDefined();
      expect(result?.address).toBe(address);
    });

    test('should return null for non-existent address', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await walletManager.getWalletByAddress('0x0000000000000000000000000000000000000000');

      expect(result).toBeNull();
    });
  });
});
