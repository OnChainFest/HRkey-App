/**
 * Wallet Controller
 *
 * Handles HTTP endpoints for wallet operations:
 * - Create custodial wallets
 * - Link non-custodial wallets (MetaMask, Coinbase, etc.)
 * - Get wallet information
 * - Get wallet balance
 * - Manage wallet settings
 */

import { Request, Response } from 'express';
import { getWalletManager } from '../services/wallet/wallet-manager';
import { getNotificationManager } from '../services/notifications/notification-manager';

/**
 * POST /api/wallet/setup
 * Create or link a wallet for the authenticated user
 */
export async function setupWallet(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore - userId added by auth middleware
    const userId = req.userId;

    const { walletType, existingAddress, walletSource } = req.body;

    // Validation
    if (!walletType || !['custodial', 'non_custodial'].includes(walletType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet type. Must be "custodial" or "non_custodial"',
      });
      return;
    }

    if (walletType === 'non_custodial' && !existingAddress) {
      res.status(400).json({
        success: false,
        error: 'existingAddress is required for non_custodial wallets',
      });
      return;
    }

    const walletManager = getWalletManager();

    // Check if user already has a wallet
    const existing = await walletManager.getWalletByUserId(userId);
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'User already has a wallet',
        wallet: {
          address: existing.address,
          type: existing.type,
          network: existing.network,
          createdAt: existing.createdAt,
        },
      });
      return;
    }

    let wallet;

    if (walletType === 'custodial') {
      // Get user email for notifications
      // @ts-ignore
      const userEmail = req.userEmail || '';

      // Create custodial wallet
      wallet = await walletManager.createCustodialWallet({
        userId,
        userEmail,
      });
    } else {
      // Link existing non-custodial wallet
      wallet = await walletManager.linkExistingWallet({
        userId,
        address: existingAddress,
        walletType: walletSource || 'other', // e.g., 'metamask', 'coinbase'
      });
    }

    // Create wallet creation notification
    const notificationManager = getNotificationManager();
    await notificationManager.createNotification({
      userId,
      type: 'wallet_created',
      title: 'Wallet Connected',
      message: `Your ${walletType === 'custodial' ? 'HRKey wallet' : 'wallet'} ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)} is now connected`,
      data: {
        wallet_address: wallet.address,
        wallet_type: walletType,
      },
      sendEmail: true,
    });

    res.status(201).json({
      success: true,
      data: {
        wallet: {
          id: wallet.id,
          address: wallet.address,
          type: wallet.type,
          network: wallet.network,
          isPrimary: wallet.isPrimary,
          createdAt: wallet.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Setup wallet error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to setup wallet',
    });
  }
}

/**
 * GET /api/wallet/info/:userId
 * Get wallet information for a user (requires auth)
 */
export async function getWalletInfo(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore - userId added by auth middleware
    const authUserId = req.userId;
    const { userId } = req.params;

    // Users can only view their own wallet (unless superadmin)
    // @ts-ignore
    const isSuperadmin = req.userRole === 'superadmin';
    if (userId !== authUserId && !isSuperadmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Can only view your own wallet',
      });
      return;
    }

    const walletManager = getWalletManager();
    const wallet = await walletManager.getWalletByUserId(userId);

    if (!wallet) {
      res.status(404).json({
        success: false,
        error: 'No wallet found for user',
        hasWallet: false,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        wallet: {
          id: wallet.id,
          address: wallet.address,
          type: wallet.type,
          network: wallet.network,
          isPrimary: wallet.isPrimary,
          createdAt: wallet.createdAt,
        },
        hasWallet: true,
      },
    });
  } catch (error) {
    console.error('Get wallet info error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet info',
    });
  }
}

/**
 * GET /api/wallet/balance/:userId
 * Get wallet balance (RLUSD + ETH)
 */
export async function getWalletBalance(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const authUserId = req.userId;
    const { userId } = req.params;

    // Users can only view their own balance (unless superadmin)
    // @ts-ignore
    const isSuperadmin = req.userRole === 'superadmin';
    if (userId !== authUserId && !isSuperadmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Can only view your own balance',
      });
      return;
    }

    const walletManager = getWalletManager();
    const balance = await walletManager.getUserBalance(userId);

    if (!balance) {
      res.status(404).json({
        success: false,
        error: 'No wallet found for user',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        address: balance.address,
        rlusd: {
          raw: balance.rlusdBalance,
          formatted: balance.rlusdBalanceFormatted,
        },
        eth: {
          raw: balance.ethBalance,
          formatted: balance.ethBalanceFormatted,
        },
      },
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet balance',
    });
  }
}

/**
 * GET /api/wallet/me
 * Get authenticated user's wallet info (convenience endpoint)
 */
export async function getMyWallet(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const userId = req.userId;

    const walletManager = getWalletManager();
    const wallet = await walletManager.getWalletByUserId(userId);

    if (!wallet) {
      res.status(200).json({
        success: true,
        data: {
          hasWallet: false,
          wallet: null,
        },
      });
      return;
    }

    // Also get balance
    const balance = await walletManager.getUserBalance(userId);

    res.status(200).json({
      success: true,
      data: {
        hasWallet: true,
        wallet: {
          id: wallet.id,
          address: wallet.address,
          type: wallet.type,
          network: wallet.network,
          isPrimary: wallet.isPrimary,
          createdAt: wallet.createdAt,
        },
        balance: balance ? {
          rlusd: {
            raw: balance.rlusdBalance,
            formatted: balance.rlusdBalanceFormatted,
          },
          eth: {
            raw: balance.ethBalance,
            formatted: balance.ethBalanceFormatted,
          },
        } : null,
      },
    });
  } catch (error) {
    console.error('Get my wallet error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet',
    });
  }
}

/**
 * DELETE /api/wallet/me
 * Delete authenticated user's wallet (with confirmation)
 */
export async function deleteMyWallet(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { confirmWithdrawal } = req.body;

    const walletManager = getWalletManager();
    await walletManager.deleteWallet(userId, confirmWithdrawal || false);

    res.status(200).json({
      success: true,
      message: 'Wallet deleted successfully',
    });
  } catch (error) {
    console.error('Delete wallet error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete wallet',
    });
  }
}

/**
 * PATCH /api/wallet/me/label
 * Update wallet label
 */
export async function updateWalletLabel(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { label } = req.body;

    if (!label || typeof label !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Label is required and must be a string',
      });
      return;
    }

    const walletManager = getWalletManager();
    await walletManager.updateWalletLabel(userId, label);

    res.status(200).json({
      success: true,
      message: 'Wallet label updated successfully',
    });
  } catch (error) {
    console.error('Update wallet label error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update wallet label',
    });
  }
}

/**
 * GET /api/wallet/has-wallet/:userId
 * Quick check if user has a wallet (for validation before operations)
 */
export async function hasWallet(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const walletManager = getWalletManager();
    const exists = await walletManager.hasWallet(userId);

    res.status(200).json({
      success: true,
      data: {
        hasWallet: exists,
        userId,
      },
    });
  } catch (error) {
    console.error('Check has wallet error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check wallet',
    });
  }
}
