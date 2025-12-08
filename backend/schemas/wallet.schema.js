/**
 * Wallet Validation Schemas
 * Using Zod for runtime type validation
 */

import { z } from 'zod';

// Wallet creation schema
export const createWalletSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  email: z.string().email('Invalid email format').max(255, 'Email too long')
});

// Get wallet schema (params)
export const getWalletParamsSchema = z.object({
  userId: z.string().uuid('Invalid user ID format')
});

export default {
  createWalletSchema,
  getWalletParamsSchema
};
