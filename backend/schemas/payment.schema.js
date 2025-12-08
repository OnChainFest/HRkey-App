/**
 * Payment Validation Schemas
 * Using Zod for runtime type validation
 */

import { z } from 'zod';

// Create payment intent schema
export const createPaymentIntentSchema = z.object({
  amount: z.number()
    .int('Amount must be an integer')
    .positive('Amount must be positive')
    .min(50, 'Minimum amount is $0.50 (50 cents)')
    .max(1000000, 'Maximum amount exceeded'),
  email: z.string().email('Invalid email format').optional(),
  promoCode: z.string().max(50, 'Promo code too long').optional()
});

export default {
  createPaymentIntentSchema
};
