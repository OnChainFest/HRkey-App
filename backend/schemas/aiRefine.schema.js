/**
 * AI Refinement Validation Schemas
 * Using Zod for runtime type validation
 */

import { z } from 'zod';

// Visibility constraint enum
const visibilityEnum = z.enum(['DEFAULT', 'CANDIDATE_ONLY', 'COMPANY_VISIBLE']).default('DEFAULT');

// Experience context schema
const experienceSchema = z.object({
  role: z.string().min(1, 'Role is required').max(200, 'Role too long'),
  company: z.string().min(1, 'Company is required').max(200, 'Company too long'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  visibility: visibilityEnum.optional().default('DEFAULT')
});

// AI refinement request schema
export const refineReferenceSchema = z.object({
  experience: experienceSchema,
  draft: z.string()
    .min(10, 'Draft must be at least 10 characters')
    .max(5000, 'Draft is too long (max 5000 characters)')
});

export default {
  refineReferenceSchema
};
