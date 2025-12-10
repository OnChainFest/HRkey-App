/**
 * Validated Reference Schemas
 *
 * Zod schemas for Reference Validation Layer (RVL) data structures.
 * Defines the shape of validated reference data stored in `validated_data` JSONB column.
 *
 * @module schemas/validatedReference
 */

import { z } from 'zod';

/**
 * Schema for a single structured dimension (KPI with confidence)
 */
export const structuredDimensionSchema = z.object({
  rating: z.number().min(0).max(5),
  confidence: z.number().min(0).max(1),
  normalized: z.number().min(0).max(1),
  feedback: z.string().nullable().optional()
});

/**
 * Schema for validation flags/warnings
 */
export const validationFlagSchema = z.object({
  type: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  details: z.record(z.any()).optional()
});

/**
 * Schema for validation metadata
 */
export const validationMetadataSchema = z.object({
  validation_version: z.string(),
  validated_at: z.string().datetime(),
  text_length: z.number().int().nonnegative(),
  kpi_count: z.number().int().nonnegative(),
  has_embedding: z.boolean(),
  processing_time_ms: z.number().int().nonnegative().optional()
});

/**
 * Schema for the complete validated reference data
 * This is what gets stored in the `validated_data` JSONB column
 */
export const validatedReferenceSchema = z.object({
  // Core validated data
  standardized_text: z.string().min(20).max(10000),
  structured_dimensions: z.record(structuredDimensionSchema),

  // Quality metrics
  consistency_score: z.number().min(0).max(1),
  fraud_score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),

  // Validation status
  validation_status: z.enum([
    'APPROVED',
    'APPROVED_WITH_WARNINGS',
    'REJECTED_HIGH_FRAUD_RISK',
    'REJECTED_CRITICAL_ISSUES',
    'REJECTED_INCONSISTENT'
  ]),
  flags: z.array(validationFlagSchema),

  // Optional: embedding vector (large array, nullable)
  embedding_vector: z.array(z.number()).nullable(),

  // Metadata
  metadata: validationMetadataSchema
});

/**
 * Schema for RVL validation options
 */
export const rvlValidationOptionsSchema = z.object({
  previousReferences: z.array(z.any()).optional(),
  skipEmbeddings: z.boolean().optional().default(false),
  skipConsistencyCheck: z.boolean().optional().default(false)
});

/**
 * Schema for raw reference input to RVL
 */
export const rvlInputSchema = z.object({
  summary: z.string().min(1, 'Summary is required'),
  kpi_ratings: z.record(z.number().min(0).max(5)).refine(
    (ratings) => Object.keys(ratings).length > 0,
    'At least one KPI rating is required'
  ),
  detailed_feedback: z.object({
    recommendation: z.string().optional(),
    strengths: z.string().optional(),
    improvements: z.string().optional()
  }).optional(),
  owner_id: z.string().uuid(),
  referrer_email: z.string().email()
});

/**
 * Schema for HRScore-formatted output
 */
export const hrScoreFormatSchema = z.object({
  kpi_ratings: z.record(z.number()),
  narrative: z.string(),
  confidence_score: z.number().min(0).max(1),
  validation_passed: z.boolean()
});

/**
 * Schema for API-formatted output
 */
export const apiFormatSchema = z.object({
  status: z.string(),
  confidence: z.number(),
  fraud_score: z.number(),
  consistency_score: z.number(),
  dimensions: z.record(structuredDimensionSchema),
  flags: z.array(z.object({
    type: z.string(),
    severity: z.string(),
    message: z.string()
  })),
  metadata: z.object({
    validated_at: z.string(),
    version: z.string()
  }),
  embedding_available: z.boolean().optional()
});

/**
 * Validates that a validated reference object matches the expected schema.
 *
 * @param {Object} data - Data to validate
 * @returns {Object} Validation result
 * @throws {z.ZodError} If validation fails
 */
export function validateValidatedReference(data) {
  return validatedReferenceSchema.parse(data);
}

/**
 * Safely validates with error handling.
 *
 * @param {Object} data - Data to validate
 * @returns {Object} { success: boolean, data?: Object, errors?: Array }
 */
export function safeValidateReference(data) {
  const result = validatedReferenceSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return {
      success: false,
      errors: result.error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }))
    };
  }
}

export default {
  validatedReferenceSchema,
  structuredDimensionSchema,
  validationFlagSchema,
  validationMetadataSchema,
  rvlValidationOptionsSchema,
  rvlInputSchema,
  hrScoreFormatSchema,
  apiFormatSchema,
  validateValidatedReference,
  safeValidateReference
};
