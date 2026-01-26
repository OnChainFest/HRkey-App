/**
 * Wallet Connection Validation Schemas
 * Identity-only wallet connection (no secrets, no balances)
 */

import { z } from 'zod';

// Ethereum address regex (0x followed by 40 hex characters)
const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

/**
 * Schema for POST /api/wallets/connect
 * Supports both custodial (Coinbase Smart Wallet) and external wallet connections
 */
export const connectWalletSchema = z.object({
  provider: z.enum(['coinbase_smart_wallet', 'external'], {
    required_error: 'Provider is required',
    invalid_type_error: 'Provider must be coinbase_smart_wallet or external'
  }),
  address: z.string()
    .regex(ethereumAddressRegex, 'Invalid Ethereum address format')
    .transform(addr => addr.toLowerCase()),
  chain: z.string().default('base'),
  // Required for external wallets to prove ownership
  signed_message: z.string().optional(),
  signature: z.string().optional()
}).refine(
  (data) => {
    // External wallets must provide signature proof
    if (data.provider === 'external') {
      return data.signed_message && data.signature;
    }
    return true;
  },
  {
    message: 'External wallets must provide signed_message and signature for ownership verification',
    path: ['signature']
  }
);

export default {
  connectWalletSchema
};
