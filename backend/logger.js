/**
 * Centralized Logging Module with Winston
 *
 * Provides structured logging for the HRKey backend with:
 * - Different formats for development (colorized, human-readable) vs production (JSON)
 * - Request correlation via requestId
 * - Configurable log levels
 * - ESM-compatible exports
 */

import winston from 'winston';
import crypto from 'crypto';

// Get configuration from environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';

// Default log levels based on environment
const DEFAULT_LOG_LEVEL = IS_PRODUCTION ? 'info' : 'debug';
const LOG_LEVEL = process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL;

/**
 * Development format: Colorized, human-readable
 * Example: [info] [2025-12-08 17:30:00] [req-123] Server started on port 3001
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
    const reqId = requestId ? `[${requestId}] ` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${level}] [${timestamp}] ${reqId}${message}${metaStr}`;
  })
);

/**
 * Production format: JSON for log aggregation
 * Example: {"level":"info","timestamp":"2025-12-08T17:30:00.000Z","message":"Server started","port":3001,"requestId":"req-123"}
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: LOG_LEVEL,
  levels: winston.config.npm.levels, // error, warn, info, http, verbose, debug, silly
  format: IS_PRODUCTION ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'hrkey-backend',
    environment: NODE_ENV
  },
  transports: [
    // Console transport (always enabled)
    new winston.transports.Console({
      // Suppress logs in test environment unless explicitly enabled
      silent: IS_TEST && !process.env.ENABLE_TEST_LOGS
    })
  ],
  // Prevent Winston from exiting on error
  exitOnError: false
});

/**
 * Create a child logger with request context
 * @param {object} req - Express request object
 * @returns {object} Child logger with requestId attached
 *
 * @example
 * const reqLogger = logger.withRequest(req);
 * reqLogger.info('Processing payment', { amount: 1000, userId: 'user-123' });
 */
logger.withRequest = function(req) {
  return this.child({
    requestId: req.requestId || req.id || 'unknown'
  });
};

/**
 * Generate a unique request ID
 * Uses crypto.randomUUID() for Node.js 14.17.0+
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  // Use crypto.randomUUID() if available (Node.js 14.17.0+)
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older Node.js versions
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Express middleware to attach requestId to each request
 * Attaches requestId to req.requestId and res.locals.requestId
 *
 * @example
 * app.use(requestIdMiddleware);
 */
export function requestIdMiddleware(req, res, next) {
  // Generate unique request ID
  const requestId = generateRequestId();

  // Attach to request and response locals
  req.requestId = requestId;
  res.locals.requestId = requestId;

  // Add X-Request-ID header to response for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  next();
}

// Export the logger instance as default
export default logger;

/**
 * Usage Examples:
 *
 * Basic logging:
 *   import logger from './logger.js';
 *   logger.info('Server started', { port: 3001 });
 *   logger.error('Database connection failed', { error: err.message });
 *
 * With request context:
 *   const reqLogger = logger.withRequest(req);
 *   reqLogger.info('Payment processed', { userId, amount });
 *
 * Configure via environment:
 *   LOG_LEVEL=debug npm start
 *   LOG_LEVEL=warn NODE_ENV=production npm start
 */
