/**
 * ZOD VALIDATION SCHEMAS - KPI REFERENCES
 *
 * Purpose: Runtime validation for KPI-driven reference endpoints
 *
 * All schemas follow strict validation rules:
 * - Required fields are enforced
 * - Enums are validated
 * - String lengths are checked
 * - Nested objects are validated
 *
 * @module schemas/kpiReference.schema
 */

import { z } from 'zod';

/**
 * Enum: Seniority Levels
 */
const seniorityLevelEnum = z.enum(['junior', 'mid', 'senior', 'lead', 'principal'], {
  errorMap: () => ({ message: 'Seniority level must be: junior, mid, senior, lead, or principal' })
});

/**
 * Enum: Relationship Types
 */
const relationshipTypeEnum = z.enum(['manager', 'peer', 'report', 'client', 'mentor', 'other'], {
  errorMap: () => ({ message: 'Relationship type must be: manager, peer, report, client, mentor, or other' })
});

/**
 * Enum: Confidence Levels
 */
const confidenceLevelEnum = z.enum(['high', 'medium', 'low'], {
  errorMap: () => ({ message: 'Confidence level must be: high, medium, or low' })
});

/**
 * Enum: Rehire Decisions
 */
const rehireDecisionEnum = z.enum(['yes', 'no', 'conditional'], {
  errorMap: () => ({ message: 'Rehire decision must be: yes, no, or conditional' })
});

/**
 * Enum: Overall Recommendations
 */
const overallRecommendationEnum = z.enum(['strongly_recommend', 'recommend', 'neutral', 'not_recommend'], {
  errorMap: () => ({ message: 'Overall recommendation must be: strongly_recommend, recommend, neutral, or not_recommend' })
});

/**
 * Schema: GET /api/kpis/sets (query params)
 */
export const getKpiSetsQuerySchema = z.object({
  role: z.string().min(1, 'Role is required').max(100, 'Role must be at most 100 characters'),
  level: seniorityLevelEnum
});

/**
 * Schema: POST /api/references/request (body)
 * Creates a new reference request
 */
export const createReferenceRequestSchema = z.object({
  candidate_id: z.string().uuid('Candidate ID must be a valid UUID'),
  referee_email: z.string().email('Referee email must be valid').max(255, 'Email must be at most 255 characters'),
  referee_name: z.string().min(1).max(255).optional(),
  relationship_type: relationshipTypeEnum,
  role: z.string().min(1, 'Role is required').max(100, 'Role must be at most 100 characters'),
  seniority_level: seniorityLevelEnum,
  expires_in_days: z.number().int().min(1).max(365).optional().default(30)
});

/**
 * Schema: KPI Score (nested object in reference submission)
 */
const kpiScoreSchema = z.object({
  kpi_id: z.string().uuid('KPI ID must be a valid UUID'),
  score: z.number()
    .int('Score must be an integer')
    .min(1, 'Score must be at least 1')
    .max(5, 'Score must be at most 5'),
  evidence_text: z.string()
    .min(50, 'Evidence text must be at least 50 characters')
    .max(5000, 'Evidence text must be at most 5000 characters')
    .transform(val => val.trim()), // Trim whitespace
  confidence_level: confidenceLevelEnum.optional().default('medium'),
  evidence_metadata: z.record(z.any()).optional() // JSON object for future extensibility
});

/**
 * Schema: POST /api/references/submit/:token (body)
 * Submits a completed reference
 */
export const submitReferenceSchema = z.object({
  relationship_type: relationshipTypeEnum,
  start_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  end_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  confidence_level: confidenceLevelEnum.optional().default('medium'),
  rehire_decision: rehireDecisionEnum,
  rehire_reasoning: z.string()
    .max(2000, 'Rehire reasoning must be at most 2000 characters')
    .optional()
    .nullable(),
  overall_recommendation: overallRecommendationEnum.optional().nullable(),
  kpis: z.array(kpiScoreSchema)
    .min(1, 'At least one KPI must be scored')
    .max(50, 'Maximum 50 KPIs allowed per reference'), // Reasonable limit
  referee_id: z.string().uuid().optional().nullable(), // If referee is registered user
  referee_name: z.string().min(1).max(255).optional().nullable(),
  ip_address: z.string().max(45).optional().nullable(), // IPv6 max length
  user_agent: z.string().max(500).optional().nullable()
}).refine(
  // Custom validation: end_date must be after start_date if both provided
  (data) => {
    if (data.start_date && data.end_date) {
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      return end >= start;
    }
    return true;
  },
  {
    message: 'End date must be on or after start date',
    path: ['end_date']
  }
);

/**
 * Schema: GET /api/references/candidate/:candidate_id (query params)
 * Optional filters for reference pack
 */
export const getCandidateReferencesQuerySchema = z.object({
  include_evidence: z.enum(['true', 'false'])
    .optional()
    .default('false')
    .transform(val => val === 'true'),
  min_confidence: confidenceLevelEnum.optional(),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .optional()
    .transform(val => val ? parseInt(val, 10) : undefined)
});

/**
 * Schema: Token validation (used in multiple endpoints)
 */
export const tokenParamSchema = z.object({
  token: z.string()
    .length(64, 'Token must be exactly 64 characters')
    .regex(/^[a-f0-9]{64}$/, 'Token must be a valid hexadecimal string')
});

/**
 * Schema: UUID param validation
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('ID must be a valid UUID')
});

export const candidateIdParamSchema = z.object({
  candidate_id: z.string().uuid('Candidate ID must be a valid UUID')
});

/**
 * Helper function to validate request body
 *
 * @param {object} schema - Zod schema
 * @returns {function} Express middleware
 */
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          validation_errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
}

/**
 * Helper function to validate query params
 *
 * @param {object} schema - Zod schema
 * @returns {function} Express middleware
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          validation_errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
}

/**
 * Helper function to validate route params
 *
 * @param {object} schema - Zod schema
 * @returns {function} Express middleware
 */
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          validation_errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
}
