/**
 * Validation Middleware
 * Uses Zod schemas to validate request data
 */

import { z } from 'zod';

/**
 * Validate request body against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      // Unexpected error
      console.error('❌ Validation error:', error);
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
};

/**
 * Validate request params against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      console.error('❌ Params validation error:', error);
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
};

/**
 * Validate request query against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      console.error('❌ Query validation error:', error);
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
};

export default {
  validateBody,
  validateParams,
  validateQuery
};
