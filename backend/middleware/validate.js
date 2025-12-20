/**
 * Validation Middleware
 * Uses Zod schemas to validate request data
 */

import { z } from 'zod';
import logger from '../logger.js';

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
        const issues = error.errors || error.issues || [];
        return res.status(400).json({
          error: 'Validation failed',
          details: issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      // Unexpected error
      logger.error('Validation middleware failed', {
        requestId: req.requestId,
        path: req.path,
        validationType: 'body',
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
};

/**
 * Validate request body against a Zod schema (422 on validation errors)
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
export const validateBody422 = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors || error.issues || [];
        return res.status(422).json({
          error: 'Validation failed',
          details: issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      logger.error('Validation middleware failed', {
        requestId: req.requestId,
        path: req.path,
        validationType: 'body',
        error: error.message,
        stack: error.stack
      });
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
        const issues = error.errors || error.issues || [];
        return res.status(400).json({
          error: 'Invalid request parameters',
          details: issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      logger.error('Params validation middleware failed', {
        requestId: req.requestId,
        path: req.path,
        validationType: 'params',
        error: error.message,
        stack: error.stack
      });
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
        const issues = error.errors || error.issues || [];
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      logger.error('Query validation middleware failed', {
        requestId: req.requestId,
        path: req.path,
        validationType: 'query',
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
};

export default {
  validateBody,
  validateBody422,
  validateParams,
  validateQuery
};
