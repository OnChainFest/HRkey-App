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
  ratings: z.record(z.string(), z.number().min(0).max(5)).refine(
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

// Reference invite request schema (references workflow MVP)
export const createReferenceInviteSchema = z.object({
  candidate_id: z.string().uuid('Invalid candidate ID').optional(),
  candidate_wallet: z.string().min(6, 'Invalid candidate wallet').optional(),
  referee_email: z.string().email('Invalid email format').max(255),
  role_id: z.string().uuid('Invalid role ID').optional(),
  message: z.string().max(2000, 'Message too long').optional()
}).refine(
  (data) => Boolean(data.candidate_id || data.candidate_wallet),
  { message: 'candidate_id or candidate_wallet is required' }
);

// Reference response schema (public)
export const respondReferenceSchema = z.object({
  ratings: z.record(z.string(), z.number().min(0).max(5)).refine(
    (ratings) => Object.keys(ratings).length > 0,
    'At least one rating is required'
  ),
  comments: z.object({
    recommendation: z.string().optional(),
    strengths: z.string().optional(),
    improvements: z.string().optional()
  }).optional()
});

export const getCandidateReferencesParamsSchema = z.object({
  candidateId: z.string().uuid('Invalid candidate ID')
});

export default {
  createReferenceRequestSchema,
  submitReferenceSchema,
  getReferenceByTokenSchema,
  createReferenceInviteSchema,
  respondReferenceSchema,
  getCandidateReferencesParamsSchema
};
