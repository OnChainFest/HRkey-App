/**
 * Wallets Controller
 * Identity-only wallet connection (no secrets, no balances, no sending)
 */

import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase;
const getSupabase = () => {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
};

/**
 * Verify signature for external wallet ownership
 * @param {string} address - Claimed wallet address
 * @param {string} message - Signed message
 * @param {string} signature - Signature to verify
 * @returns {boolean} - True if signature is valid
 */
function verifyWalletOwnership(address, message, signature) {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    logger.warn('Signature verification failed', {
      error: error.message,
      address
    });
    return false;
  }
}

/**
 * POST /api/wallets/connect
 * Connect a wallet to user account (identity anchoring only)
 */
export async function connectWallet(req, res) {
  try {
    const { provider, address, chain, signed_message, signature } = req.body;
    const userId = req.user.id;

    // For external wallets, verify ownership via signature
    if (provider === 'external') {
      if (!signed_message || !signature) {
        return res.status(400).json({
          success: false,
          error: 'SIGNATURE_REQUIRED',
          message: 'External wallets require signed_message and signature for ownership verification'
        });
      }

      const isOwner = verifyWalletOwnership(address, signed_message, signature);
      if (!isOwner) {
        logger.warn('Wallet ownership verification failed', {
          requestId: req.requestId,
          userId,
          address
        });
        return res.status(403).json({
          success: false,
          error: 'SIGNATURE_INVALID',
          message: 'Signature verification failed. You must own this wallet address.'
        });
      }
    }

    // Check if user already has a wallet connected
    const { data: existingWallet, error: checkError } = await getSupabase()
      .from('wallets')
      .select('id, address')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingWallet) {
      return res.status(409).json({
        success: false,
        error: 'WALLET_EXISTS',
        message: 'User already has a connected wallet. Disconnect first to connect a new one.'
      });
    }

    // Check if address is already connected to another user
    const { data: addressInUse, error: addressCheckError } = await getSupabase()
      .from('wallets')
      .select('id')
      .eq('address', address.toLowerCase())
      .maybeSingle();

    if (addressCheckError && addressCheckError.code !== 'PGRST116') {
      throw addressCheckError;
    }

    if (addressInUse) {
      return res.status(409).json({
        success: false,
        error: 'ADDRESS_IN_USE',
        message: 'This wallet address is already connected to another account'
      });
    }

    // Insert wallet record
    const walletRow = {
      user_id: userId,
      address: address.toLowerCase(),
      provider,
      chain: chain || 'base',
      created_at: new Date().toISOString()
    };

    const { data: wallet, error: insertError } = await getSupabase()
      .from('wallets')
      .insert([walletRow])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Update user's wallet_address field for backward compatibility
    await getSupabase()
      .from('users')
      .update({ wallet_address: address.toLowerCase() })
      .eq('id', userId);

    logger.info('Wallet connected successfully', {
      requestId: req.requestId,
      userId,
      address: address.toLowerCase(),
      provider,
      chain: chain || 'base'
    });

    return res.status(201).json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        provider: wallet.provider,
        chain: wallet.chain,
        created_at: wallet.created_at
      }
    });
  } catch (error) {
    logger.error('Failed to connect wallet', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to connect wallet'
    });
  }
}

/**
 * GET /api/wallets/me
 * Get current user's connected wallet
 */
export async function getMyWallet(req, res) {
  try {
    const userId = req.user.id;

    const { data: wallet, error } = await getSupabase()
      .from('wallets')
      .select('id, address, provider, chain, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'WALLET_NOT_FOUND',
        message: 'No wallet connected to this account'
      });
    }

    return res.json({
      success: true,
      wallet
    });
  } catch (error) {
    logger.error('Failed to get wallet', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve wallet'
    });
  }
}

export default {
  connectWallet,
  getMyWallet
};
