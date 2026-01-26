/**
 * Billing Validation Schemas
 * Stripe checkout session creation
 */

import { z } from 'zod';

/**
 * Schema for POST /api/billing/create-checkout-session
 */
export const createCheckoutSessionSchema = z.object({
  product_code: z.string().min(1).max(50, 'Product code is required'),
  success_url: z.string().url('Invalid success URL').optional(),
  cancel_url: z.string().url('Invalid cancel URL').optional()
});

export default {
  createCheckoutSessionSchema
};
