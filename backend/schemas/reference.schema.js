/**
 * Reference Validation Schemas
 * Using Zod for runtime type validation
 */

import { z } from 'zod';

// Reference request schema
export const createReferenceRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  email: z.string().email('Invalid email format').max(255),
  name: z.string().min(2, 'Name must be at least 2 characters').max(200, 'Name too long'),
  applicantData: z.object({
    applicantPosition: z.string().optional(),
    applicantCompany: z.string().optional(),
    relationship: z.string().optional()
  }).optional()
});

// Submit reference schema
export const submitReferenceSchema = z.object({
  token: z.string().min(32, 'Invalid token'),
  refereeData: z.object({
    name: z.string().optional(),
    email: z.string().email().optional()
  }).optional(),
  ratings: z.record(z.number().min(0).max(5)).refine(
    (ratings) => Object.keys(ratings).length > 0,
    'At least one rating is required'
  ),
  comments: z.object({
    recommendation: z.string().optional(),
    strengths: z.string().optional(),
    improvements: z.string().optional()
  }).optional()
});

// Get reference by token schema (params)
export const getReferenceByTokenSchema = z.object({
  token: z.string().min(32, 'Invalid token format')
});

export default {
  createReferenceRequestSchema,
  submitReferenceSchema,
  getReferenceByTokenSchema
};
