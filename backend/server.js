/**
 * HRKEY BACKEND - Unified Service (ESM)
 * Wallets + References + Emails (Resend) + Stripe Payments
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import Stripe from 'stripe';
import { makeRefereeLink as makeRefereeLinkUtil, APP_URL as UTIL_APP_URL } from './utils/appUrl.js';
import * as Sentry from '@sentry/node';

// Import new controllers
import identityController from './controllers/identityController.js';
import companyController from './controllers/companyController.js';
import signersController from './controllers/signersController.js';
import auditController from './controllers/auditController.js';
import dataAccessController from './controllers/dataAccessController.js';
import revenueController from './controllers/revenueController.js';
import kpiObservationsController from './controllers/kpiObservationsController.js';
import candidateEvaluationController from './controllers/candidateEvaluation.controller.js';
import tokenomicsPreviewController from './controllers/tokenomicsPreview.controller.js';
import publicProfileController from './controllers/publicProfile.controller.js';
import publicIdentifierController from './controllers/publicIdentifier.controller.js';
import adminOverviewController from './controllers/adminOverview.controller.js';
import analyticsController from './controllers/analyticsController.js';
import hrscoreController from './controllers/hrscoreController.js';
import referencesController from './controllers/referencesController.js';
import hrkeyScoreService from './hrkeyScoreService.js';
import { getScoreSnapshots } from './services/hrscore/scoreSnapshots.js';

// Import services
import * as webhookService from './services/webhookService.js';
import { ReferenceService, hashInviteToken } from './services/references.service.js';

// Import logging
import logger, { requestIdMiddleware, requestLoggingMiddleware } from './logger.js';

// Import middleware
import {
  requireAuth,
  requireSuperadmin,
  requireCompanySigner,
  requireSelfOrSuperadmin,
  requireWalletLinked,
  requireOwnWallet,
  optionalAuth
} from './middleware/auth.js';
import { validateBody, validateBody422, validateParams } from './middleware/validate.js';

// Import validation schemas
import { createWalletSchema, getWalletParamsSchema } from './schemas/wallet.schema.js';
import {
  createReferenceRequestSchema,
  submitReferenceSchema,
  getReferenceByTokenSchema,
  createReferenceInviteSchema,
  respondReferenceSchema,
  getCandidateReferencesParamsSchema
} from './schemas/reference.schema.js';
import { createPaymentIntentSchema } from './schemas/payment.schema.js';

dotenv.config();

/* =========================
   Sentry Error Monitoring
   ========================= */
const isTest = process.env.NODE_ENV === 'test';
const sentryEnabled = !isTest && !!process.env.SENTRY_DSN;

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
    enabled: sentryEnabled,
    // Usamos las integraciones por defecto de @sentry/node v8
    integrations: (integrations) => [
      ...integrations,
    ],
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0')
  });
}

/* =========================
   URL helpers (robustos)
   ========================= */
const PROD_URL = 'https://hrkey.xyz';

function getPublicBaseURL() {
  const fromEnv =
    process.env.PUBLIC_BASE_URL ||     // recomendado (unificado)
    process.env.BASE_URL ||            // alias común
    process.env.FRONTEND_URL ||        // a veces ya lo tienes así en Vercel
    process.env.PUBLIC_APP_URL ||      // variantes históricas
    process.env.APP_URL ||             // si lo usas para front
    null;

  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return PROD_URL;
}

// URL pública del frontend (UNIFICADA para construir links que verán usuarios)
const APP_URL = UTIL_APP_URL || getPublicBaseURL();

/** Wrapper seguro: si el util existe, úsalo; si no, construye aquí. */
function makeRefereeLink(token) {
  try {
    if (typeof makeRefereeLinkUtil === 'function') {
      const url = makeRefereeLinkUtil(token);
      if (url && /^https?:\/\//i.test(url)) return url;
    }
  } catch (_) { /* fall back */ }

  const url = new URL('/referee-evaluation-page.html', APP_URL);
  url.searchParams.set('ref', token);
  return url.toString();
}

/* =========================
   Config
   ========================= */
const PORT = process.env.PORT || 3001;

// Backend público (si aplica: Render/Fly/etc.) — solo para log/health
const BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL ||
  process.env.API_BASE_URL ||
  process.env.APP_BACKEND_URL ||
  process.env.APP_URL || // si reusas APP_URL para backend público
  getPublicBaseURL();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// SECURITY: Validate Stripe secrets configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Fail fast in production if Stripe secrets are missing
if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  const message = 'CRITICAL: Stripe secrets not configured';
  if (process.env.NODE_ENV === 'production') {
    logger.error(message, {
      hasSecretKey: !!STRIPE_SECRET_KEY,
      hasWebhookSecret: !!STRIPE_WEBHOOK_SECRET,
      environment: process.env.NODE_ENV
    });
    throw new Error(`${message}. Cannot start in production without Stripe configuration.`);
  } else {
    logger.warn(message + ' - Using test mode', {
      environment: process.env.NODE_ENV
    });
  }
}

const stripe = new Stripe(STRIPE_SECRET_KEY || 'sk_test_placeholder');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================
   Superadmin Auto-Assignment
   ========================= */
async function ensureSuperadmin() {
  const superadminEmail = process.env.HRKEY_SUPERADMIN_EMAIL;

  if (!superadminEmail) {
    logger.warn('Superadmin email not configured', {
      message: 'HRKEY_SUPERADMIN_EMAIL environment variable not set'
    });
    return;
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('email', superadminEmail)
      .single();

    if (error || !user) {
      logger.warn('Superadmin user not found in database', {
        email: superadminEmail,
        error: error?.message
      });
      return;
    }

    if (user.role !== 'superadmin') {
      await supabase
        .from('users')
        .update({ role: 'superadmin' })
        .eq('id', user.id);

      logger.info('Superadmin role assigned', {
        userId: user.id,
        email: superadminEmail
      });
    } else {
      logger.info('Superadmin already configured', {
        userId: user.id,
        email: superadminEmail
      });
    }
  } catch (err) {
    logger.error('Failed to ensure superadmin', {
      error: err.message,
      stack: err.stack
    });
  }
}

/* =========================
   Services
   ========================= */
class WalletCreationService {
  static async createWalletForUser(userId, email) {
    const existing = await this.checkExistingWallet(userId);
    if (existing) return existing;

    const wallet = ethers.Wallet.createRandom();
    const encrypted = await this.encryptPrivateKey(wallet.privateKey, userId);

    const row = {
      user_id: userId,
      address: wallet.address,
      encrypted_private_key: encrypted,
      network: 'base-mainnet',
      wallet_type: 'custodial',
      is_active: true,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('user_wallets').insert([row]).select().single();
    if (error) throw error;

    await this.initializeUserPlan(userId, wallet.address);

    return {
      address: wallet.address,
      network: 'base-mainnet',
      walletType: 'custodial',
      createdAt: row.created_at
    };
  }

  static async checkExistingWallet(userId) {
    const { data, error } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  static async encryptPrivateKey(privateKey, userId) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(userId, 'hrkey-salt-2025', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  static async initializeUserPlan(userId, walletAddress) {
    const row = {
      user_id: userId,
      address: walletAddress,
      plan: 'free',
      references_used: 0,
      references_limit: 1,
      features: {
        canUseBlockchain: false,
        canAddPeerValidations: false,
        canAddCustomerValidations: false,
        canProfitFromData: false,
        canShareReferences: true
      },
      payment_tx_hash: null,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('user_plans').insert([row]);
    if (error) throw error;
  }

  static async getUserWallet(userId) {
    const { data, error } = await supabase
      .from('user_wallets')
      .select('address, network, wallet_type, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
    if (error) throw error;
    return data;
  }
}



/* =========================
   App & Middleware
   ========================= */
const app = express();

// CORS configuration (dynamic based on environment)
const FRONTEND_URL = process.env.FRONTEND_URL || APP_URL;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc) - only in development
    if (!origin) {
      if (IS_PRODUCTION) {
        logger.warn('CORS: Request without origin in production', { path: 'unknown' });
        return callback(new Error('Origin header required in production'));
      }
      return callback(null, true);
    }

    const allowedOrigins = [
      FRONTEND_URL,
      'http://localhost:8000',
      'http://localhost:3000',
      'http://127.0.0.1:8000',
      'https://hrkey.xyz',
      'https://hrkey.vercel.app'
    ];

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn('CORS policy violation', {
        origin,
        environment: process.env.NODE_ENV,
        blocked: IS_PRODUCTION
      });

      // SECURITY: Block in production, allow in development for testing
      if (IS_PRODUCTION) {
        callback(new Error('CORS policy: Origin not allowed'));
      } else {
        callback(null, true); // Permissive in development
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Stripe webhook necesita body RAW; para el resto usamos JSON normal
app.use(cors(corsOptions));

// Request ID middleware for request correlation
app.use(requestIdMiddleware);

// HTTP request/response logging with structured data
app.use(requestLoggingMiddleware);

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.coinbase.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "https://mainnet.base.org",
        "https://sepolia.base.org",
        "https://*.supabase.co",
        "https://api.stripe.com"
      ],
      frameSrc: ["'self'", "https://js.stripe.com"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false, // Required for Base SDK compatibility
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}));

// Rate limiting configuration
const apiLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Max 100 requests per IP per window
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health check
        return req.path === '/health';
      }
    });

// Strict rate limiter for sensitive endpoints (disabled in tests to avoid flakiness)
const strictLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // Max 5 requests per IP per hour
      message: 'Too many attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true // Only count failed requests
    });

// Auth-related rate limiter
const authLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Max 10 attempts per IP
      message: 'Too many authentication attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });

// Token validation rate limiter (for public token endpoints)
const tokenLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 20, // Max 20 token validation attempts per IP per hour
      message: 'Too many token validation attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });

async function resolveCandidateId({ candidateId, candidateWallet }) {
  if (candidateId) return candidateId;
  if (!candidateWallet) return null;

  const { data: userByWallet, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', candidateWallet)
    .single();

  if (!userError && userByWallet?.id) return userByWallet.id;

  const { data: walletRow, error: walletError } = await supabase
    .from('user_wallets')
    .select('user_id')
    .eq('address', candidateWallet)
    .eq('is_active', true)
    .single();

  if (!walletError && walletRow?.user_id) return walletRow.user_id;
  return null;
}

async function hasApprovedReferenceAccess(requesterId, candidateId) {
  if (!requesterId || !candidateId) return false;

  const { data, error } = await supabase
    .from('data_access_requests')
    .select('id, status, requested_data_type')
    .eq('requested_by_user_id', requesterId)
    .eq('target_user_id', candidateId)
    .eq('status', 'APPROVED')
    .in('requested_data_type', ['reference', 'profile', 'full_data'])
    .maybeSingle();

  if (error) {
    logger.warn('Failed to check data access approval', {
      requesterId,
      candidateId,
      error: error.message
    });
    return false;
  }

  return !!data;
}

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// JSON body parsing with size limits (DoS protection)
app.use((req, res, next) => {
  // Stripe webhook needs raw body
  if (req.path === '/webhook') return next();

  // SECURITY: Limit payload size to prevent DoS attacks
  return express.json({
    limit: '1mb', // Maximum 1MB payload
    strict: true, // Only accept objects and arrays
    verify: (req, buf, encoding) => {
      // Additional verification if needed
      if (buf.length > 1024 * 1024) {
        throw new Error('Request entity too large');
      }
    }
  })(req, res, next);
});

/* =========================
   Sentry Request Context
   ========================= */

if (sentryEnabled) {
  // Solo añadimos contexto de requestId y user al scope de Sentry.
  // La captura de errores se hace con captureException y los
  // handlers globales de Node (uncaughtException, unhandledRejection).
  app.use((req, res, next) => {
    const requestId = req.requestId || res.locals.requestId;
    if (requestId) {
      Sentry.setTag('request_id', requestId);
    }

    if (req.user) {
      Sentry.setUser({
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      });
    }

    next();
  });
}

/* =========================
   Health Check Endpoints
   ========================= */

// Simple health check - no authentication, no external dependencies
// Returns basic server status for quick liveness checks
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'hrkey-backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Deep health check - includes dependency validation
// Checks Supabase connectivity and Stripe configuration
// Returns 503 for critical failures, 200 for ok/degraded states
app.get('/health/deep', async (req, res) => {
  const startTime = Date.now();
  const healthcheck = {
    status: 'ok',
    service: 'hrkey-backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      supabase: { status: 'ok' },
      stripe: { status: 'ok' }
    }
  };

  // Check Supabase connectivity
  try {
    const supabaseStartTime = Date.now();

    // Lightweight Supabase ping with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase health check timeout')), 5000)
    );

    const checkPromise = supabase
      .from('users')
      .select('count')
      .limit(1);

    const { error } = await Promise.race([checkPromise, timeoutPromise]);

    const supabaseResponseTime = Date.now() - supabaseStartTime;

    if (error) {
      healthcheck.status = 'degraded';
      healthcheck.checks.supabase = {
        status: 'error',
        error: error.message,
        responseTime: supabaseResponseTime
      };
    } else {
      healthcheck.checks.supabase = {
        status: 'ok',
        responseTime: supabaseResponseTime
      };
    }
  } catch (err) {
    healthcheck.status = 'degraded';
    healthcheck.checks.supabase = {
      status: 'error',
      error: err.message,
      responseTime: Date.now() - startTime
    };
  }

  // Check Stripe configuration (not connectivity, just config)
  // Note: Stripe config warnings don't change overall health status from 'ok' to 'degraded'
  // Only actual errors or Supabase failures cause degraded status
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !stripeWebhookSecret) {
      healthcheck.checks.stripe = {
        status: 'warning',
        configured: false,
        message: 'Stripe secrets not configured'
      };
    } else if (
      stripeSecretKey === 'your-secret-key' ||
      stripeWebhookSecret === 'your-webhook-secret' ||
      stripeSecretKey.length < 20 ||
      stripeWebhookSecret.length < 20
    ) {
      healthcheck.checks.stripe = {
        status: 'warning',
        configured: false,
        message: 'Stripe secrets appear to be invalid or placeholder values'
      };
    } else {
      healthcheck.checks.stripe = {
        status: 'ok',
        configured: true
      };
    }
  } catch (err) {
    // Actual errors in checking Stripe mark overall status as degraded
    healthcheck.status = healthcheck.status === 'ok' ? 'degraded' : healthcheck.status;
    healthcheck.checks.stripe = {
      status: 'error',
      configured: false,
      error: err.message
    };
  }

  // Determine HTTP status code
  // 200: ok or degraded (service still functional)
  // 503: error (critical failure, service not ready)
  const httpStatus = healthcheck.status === 'error' ? 503 : 200;

  res.status(httpStatus).json(healthcheck);
});

/* =========================
   Wallet endpoints
   ========================= */
app.post('/api/wallet/create', requireAuth, strictLimiter, validateBody(createWalletSchema), async (req, res) => {
  try {
    const { userId, email } = req.body;

    // Authorization check: users can only create wallets for themselves
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only create a wallet for yourself'
      });
    }

    const wallet = await WalletCreationService.createWalletForUser(userId, email);
    res.json({ success: true, wallet });
  } catch (e) {
    logger.error('Failed to create wallet', {
      requestId: req.requestId,
      userId: req.body.userId,
      email: req.body.email,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/:userId', requireAuth, validateParams(getWalletParamsSchema), async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorization: only the wallet owner or a superadmin may view this wallet
    const isOwner = req.user?.id === userId;
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own wallet'
      });
    }

    const wallet = await WalletCreationService.getUserWallet(userId);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ success: true, wallet });
  } catch (e) {
    logger.error('Failed to fetch wallet', {
      requestId: req.requestId,
      userId: req.params.userId,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   Reference endpoints
   ========================= */
app.post('/api/reference/request', requireAuth, validateBody(createReferenceRequestSchema), async (req, res) => {
  try {
    const { userId } = req.body;

    // Authorization check: users can only request references for themselves
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only request references for yourself'
      });
    }

    const result = await ReferenceService.createReferenceRequest(req.body);
    res.json(result);
  } catch (e) {
    logger.error('Failed to create reference request', {
      requestId: req.requestId,
      userId: req.body.userId,
      refereeEmail: req.body.email,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ success: false, error: e.message });
  }
});

// SECURITY: Rate limit public reference submission to prevent abuse
// Token validation enforces: valid format, not expired, single-use
app.post('/api/reference/submit', tokenLimiter, validateBody(submitReferenceSchema), async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (e) {
    logger.error('Failed to submit reference', {
      requestId: req.requestId,
      tokenHashPrefix: req.body.token ? hashInviteToken(req.body.token).slice(0, 12) : undefined,
      error: e.message,
      stack: e.stack
    });
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// SECURITY: Rate limit token lookups to prevent enumeration attacks
app.get('/api/reference/by-token/:token', tokenLimiter, validateParams(getReferenceByTokenSchema), async (req, res) => {
  try {
    const result = await ReferenceService.getReferenceByToken(req.params.token);
    res.json(result);
  } catch (e) {
    logger.error('Failed to get reference by token', {
      requestId: req.requestId,
      tokenHashPrefix: req.params.token ? hashInviteToken(req.params.token).slice(0, 12) : undefined,
      error: e.message,
      stack: e.stack
    });
    res.status(400).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/references/me
 * Get all references for the authenticated user (self-only)
 *
 * Auth: Authenticated users, returns only own references
 */
app.get('/api/references/me', requireAuth, referencesController.getMyReferences);

/**
 * GET /api/references/pending
 * Get pending reference invites for the authenticated user (self-only)
 *
 * Auth: Authenticated users, returns only own pending invites
 */
app.get('/api/references/pending', requireAuth, referencesController.getMyPendingInvites);

/**
 * GET /api/references/candidate/:candidateId
 * Get references for a specific candidate (superadmin only for now)
 *
 * Auth: Superadmin can view all; companies require approved data-access (TODO)
 */
app.get('/api/references/candidate/:candidateId', requireAuth, referencesController.getCandidateReferences);

/* =========================
   References workflow MVP
   ========================= */
app.post(
  '/api/references/request',
  requireAuth,
  validateBody422(createReferenceInviteSchema),
  referencesController.requestReferenceInvite
);

// SECURITY: Rate limit public reference submission to prevent abuse
app.post(
  '/api/references/respond/:token',
  tokenLimiter,
  optionalAuth,
  validateParams(getReferenceByTokenSchema),
  validateBody422(respondReferenceSchema),
  referencesController.respondToReferenceInvite
);

/* =========================
   Stripe Payments
   ========================= */
app.post('/create-payment-intent', requireAuth, authLimiter, validateBody(createPaymentIntentSchema), async (req, res) => {
  try {
    const { amount, email, promoCode } = req.body;

    // Use authenticated user's email if not provided
    const receiptEmail = email || req.user.email;

    const paymentIntent = await stripe.paymentIntents.create({
      amount, // en centavos
      currency: 'usd',
      receipt_email: receiptEmail,
      metadata: {
        promoCode: promoCode || 'none',
        plan: 'pro-lifetime'
      },
      description: 'HRKey PRO - Lifetime Access'
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (e) {
    logger.error('Failed to create Stripe payment intent', {
      requestId: req.requestId,
      userId: req.user?.id,
      amount: req.body.amount,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook: body RAW
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const reqLogger = logger.withRequest(req);
  let event;

  // Step 1: Verify Stripe signature
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    reqLogger.error('Webhook signature verification failed', {
      error: err.message,
      hasSignature: !!sig
    });

    // Capture signature verification failures in Sentry
    if (sentryEnabled) {
      Sentry.captureException(err, scope => {
        scope.setTag('controller', 'webhook');
        scope.setTag('route', 'POST /webhook');
        scope.setTag('error_type', 'signature_verification');
        scope.setContext('webhook', {
          hasSignature: !!sig,
          path: req.path
        });
        return scope;
      });
    }

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Step 2: Check idempotency - has this event already been processed?
    const alreadyProcessed = await webhookService.isEventProcessed(event.id);
    if (alreadyProcessed) {
      reqLogger.info('Event already processed, skipping (idempotency)', {
        eventId: event.id,
        eventType: event.type
      });
      return res.json({ received: true, idempotent: true });
    }

    // Step 3: Process event based on type
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        reqLogger.info('Processing payment_intent.succeeded', {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          email: paymentIntent.receipt_email
        });

        const result = await webhookService.processPaymentSuccess(paymentIntent);

        if (result.success) {
          reqLogger.info('Payment processed successfully', {
            userId: result.user?.id,
            userEmail: result.user?.email,
            plan: result.user?.plan,
            transactionId: result.transaction?.id,
            paymentIntentId: result.paymentIntentId
          });
        } else {
          reqLogger.warn('Payment processed with warnings', {
            reason: result.reason,
            paymentIntentId: result.paymentIntentId,
            email: result.email
          });
        }

        // Step 4: Mark event as processed (idempotency)
        await webhookService.markEventProcessed(event.id, event.type, {
          payment_intent_id: paymentIntent.id,
          amount: paymentIntent.amount,
          email: paymentIntent.receipt_email
        });

        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        reqLogger.warn('Processing payment_intent.payment_failed', {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          email: paymentIntent.receipt_email
        });

        await webhookService.processPaymentFailed(paymentIntent);
        await webhookService.markEventProcessed(event.id, event.type, {
          payment_intent_id: paymentIntent.id
        });

        break;
      }

      default:
        // Unsupported event type - just log and mark as processed
        reqLogger.info('Unsupported event type', {
          eventType: event.type,
          eventId: event.id
        });
        await webhookService.markEventProcessed(event.id, event.type, {
          note: 'Event type not explicitly handled'
        });
    }

    res.json({ received: true });
  } catch (error) {
    reqLogger.error('Webhook processing error', {
      error: error.message,
      stack: error.stack,
      eventId: event?.id,
      eventType: event?.type
    });

    // Capture webhook processing errors in Sentry
    if (sentryEnabled) {
      Sentry.captureException(error, scope => {
        scope.setTag('controller', 'webhook');
        scope.setTag('route', 'POST /webhook');
        scope.setTag('error_type', 'processing_error');
        scope.setContext('webhook', {
          eventId: event?.id,
          eventType: event?.type
        });
        return scope;
      });
    }

    // Return 500 so Stripe will retry
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/* =========================
   IDENTITY & PERMISSIONS ENDPOINTS (New)
   ========================= */

// ===== IDENTITY ENDPOINTS =====
app.post('/api/identity/verify', authLimiter, requireAuth, identityController.verifyIdentity);
app.get('/api/identity/status/:userId', requireAuth, requireSelfOrSuperadmin('userId', { message: 'You can only view your own identity status' }), identityController.getIdentityStatus);

// ===== CANDIDATE EVALUATION ENDPOINT =====
app.get(
  '/api/candidates/:userId/evaluation',
  requireAuth,
  candidateEvaluationController.getCandidateEvaluation
);
app.get(
  '/api/candidates/:userId/tokenomics-preview',
  requireAuth,
  tokenomicsPreviewController.getTokenomicsPreview
);
app.get('/api/me/public-identifier', requireAuth, publicIdentifierController.getMyPublicIdentifier);
app.get('/api/public/candidates/:identifier', publicProfileController.getPublicCandidateProfile);

// ===== COMPANY ENDPOINTS =====
app.post('/api/company/create', requireAuth, companyController.createCompany);
app.get('/api/companies/my', requireAuth, companyController.getMyCompanies);
app.get('/api/company/:companyId', requireAuth, requireCompanySigner, companyController.getCompany);
app.patch('/api/company/:companyId', requireAuth, requireCompanySigner, companyController.updateCompany);
app.post('/api/company/:companyId/verify', requireAuth, requireSuperadmin, companyController.verifyCompany);

// ===== COMPANY SIGNERS ENDPOINTS =====
app.post('/api/company/:companyId/signers', strictLimiter, requireAuth, requireCompanySigner, signersController.inviteSigner);
app.get('/api/company/:companyId/signers', requireAuth, requireCompanySigner, signersController.getSigners);
app.patch('/api/company/:companyId/signers/:signerId', requireAuth, requireCompanySigner, signersController.updateSigner);

// Signer invitation endpoints (special handling)
// SECURITY: Rate limit public signer invitations to prevent token enumeration
app.get('/api/signers/invite/:token', tokenLimiter, signersController.getInvitationByToken); // Public - no auth
app.post('/api/signers/accept/:token', requireAuth, signersController.acceptSignerInvitation);

// ===== AUDIT LOG ENDPOINTS =====
app.get('/api/audit/logs', requireAuth, auditController.getAuditLogs);
app.get('/api/audit/recent', requireAuth, auditController.getRecentActivity);
app.get('/api/admin/overview', requireAuth, adminOverviewController.getAdminOverviewHandler);

// ===== DATA ACCESS ENDPOINTS (Pay-per-query) =====
app.post('/api/data-access/request', requireAuth, dataAccessController.createDataAccessRequest);
app.get('/api/data-access/pending', requireAuth, dataAccessController.getPendingRequests);
app.post('/api/data-access/:requestId/approve', requireAuth, dataAccessController.approveDataAccessRequest);
app.post('/api/data-access/:requestId/reject', requireAuth, dataAccessController.rejectDataAccessRequest);
app.get('/api/data-access/:requestId/data', requireAuth, dataAccessController.getDataByRequestId);

// ===== REVENUE SHARING ENDPOINTS =====
app.get('/api/revenue/balance', requireAuth, revenueController.getUserBalance);
app.get('/api/revenue/shares', requireAuth, revenueController.getRevenueShares);
app.get('/api/revenue/transactions', requireAuth, revenueController.getTransactionHistory);
app.get('/api/revenue/summary', requireAuth, revenueController.getEarningsSummary);
// SECURITY: Payout requires wallet since default method is 'wallet'
app.post('/api/revenue/payout/request', requireAuth, requireWalletLinked({ message: 'You must have a linked wallet to request payouts' }), revenueController.requestPayout);

/* =========================
   KPI OBSERVATIONS ENDPOINTS (Proof of Correlation MVP)
   ========================= */

// ===== KPI OBSERVATIONS - Data Capture for ML Correlation Engine =====
// These endpoints capture structured KPI evaluations that will be used by the Python
// correlation engine to measure relationships between KPIs and job outcomes.

/**
 * POST /api/kpi-observations
 * Create one or more KPI observations (batch insert)
 *
 * Example curl:
 * curl -X POST http://localhost:3001/api/kpi-observations \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "subject_wallet": "0xSUBJECT_ADDRESS",
 *     "observer_wallet": "0xOBSERVER_ADDRESS",
 *     "role_id": "uuid-of-role",
 *     "role_name": "Backend Developer",
 *     "observations": [
 *       {
 *         "kpi_name": "deployment_frequency",
 *         "rating_value": 4,
 *         "outcome_value": 120,
 *         "context_notes": "Deployed 120 times in Q1 2024",
 *         "observation_period": "Q1 2024"
 *       },
 *       {
 *         "kpi_name": "code_quality",
 *         "rating_value": 5,
 *         "context_notes": "Excellent code reviews"
 *       }
 *     ]
 *   }'
 */
// SECURITY: KPI observations require authentication and linked wallet to prevent data poisoning
app.post('/api/kpi-observations', requireAuth, requireWalletLinked({ message: 'You must have a linked wallet to submit KPI observations' }), kpiObservationsController.createKpiObservations);

/**
 * GET /api/kpi-observations
 * Retrieve KPI observations with filters
 *
 * Query params:
 * - subject_wallet: Filter by subject
 * - observer_wallet: Filter by observer
 * - role_id: Filter by role
 * - kpi_name: Filter by KPI name
 * - verified: Filter by verification status (true/false)
 * - limit: Max results (default: 200, max: 1000)
 * - offset: Pagination offset
 *
 * Example:
 * curl http://localhost:3001/api/kpi-observations?subject_wallet=0xABC&limit=50
 */
// SECURITY: Protect KPI data from unauthorized access
app.get('/api/kpi-observations', requireAuth, kpiObservationsController.getKpiObservations);

/**
 * GET /api/kpi-observations/summary
 * Get aggregated KPI summary (for analytics/Python ML)
 *
 * This endpoint uses the kpi_observations_summary VIEW which aggregates
 * observations by (subject, role, kpi) - perfect for feeding into pandas/scikit-learn.
 *
 * Query params:
 * - subject_wallet: Filter by subject
 * - role_id: Filter by role
 * - kpi_name: Filter by KPI
 * - limit: Max results (default: 100, max: 1000)
 *
 * Example:
 * curl http://localhost:3001/api/kpi-observations/summary?role_id=uuid
 */
// SECURITY: Protect aggregated KPI data from unauthorized access
app.get('/api/kpi-observations/summary', requireAuth, kpiObservationsController.getKpiObservationsSummary);

/* =========================
   HRKEY SCORE ENDPOINTS (ML-powered scoring)
   ========================= */

// ===== HRKEY SCORE - ML-powered professional scoring =====
// This endpoint calculates a professional score (0-100) based on KPI observations
// using a trained Ridge regression model.

/**
 * POST /api/hrkey-score
 * Calculate HRKey Score for a subject+role
 *
 * Request body:
 * {
 *   "subject_wallet": "0xSUBJECT_ADDRESS",
 *   "role_id": "uuid-of-role"
 * }
 *
 * Response (success):
 * {
 *   "ok": true,
 *   "subject_wallet": "0xSUBJECT",
 *   "role_id": "uuid",
 *   "score": 78.45,              // HRKey Score (0-100)
 *   "raw_prediction": 125432.50, // Raw prediction in outcome_value scale
 *   "confidence": 0.8944,        // Confidence level (0-1)
 *   "confidence_percentage": 89.44,
 *   "n_observations": 16,        // Number of KPI observations used
 *   "used_kpis": ["kpi_1", "kpi_2", ...],
 *   "model_info": {
 *     "model_type": "ridge",
 *     "trained_at": "2025-11-22T...",
 *     "role_scope": "global",
 *     "metrics": { "mae": 8234.56, "rmse": 10567.89, "r2": 0.7456 }
 *   }
 * }
 *
 * Response (not enough data):
 * {
 *   "ok": false,
 *   "reason": "NOT_ENOUGH_DATA",
 *   "message": "Se requieren al menos 3 observaciones...",
 *   "n_observations": 2
 * }
 *
 * Example curl:
 * curl -X POST http://localhost:3001/api/hrkey-score \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "subject_wallet": "0xSUBJECT_ADDRESS",
 *     "role_id": "UUID_OF_ROLE"
 *   }'
 */
// SECURITY: Protect ML model from unauthorized access and model extraction attacks
// Authorization: Users can only calculate score for their own wallet, superadmins can calculate for any
// Uses requireOwnWallet middleware for wallet-scoped authorization
app.post('/api/hrkey-score', requireAuth, requireOwnWallet('subject_wallet', {
  noWalletMessage: 'You must have a linked wallet to calculate scores',
  mismatchMessage: 'You can only calculate HRKey Score for your own wallet'
}), async (req, res) => {
  try {
    const { subject_wallet, role_id } = req.body;

    // Validar campos requeridos
    if (!subject_wallet || !role_id) {
      return res.status(400).json({
        ok: false,
        error: 'MISSING_FIELDS',
        message: 'Se requieren subject_wallet y role_id.',
        required: ['subject_wallet', 'role_id']
      });
    }

    // Calcular HRKey Score
    const result = await hrkeyScoreService.computeHrkeyScore({
      subjectWallet: subject_wallet,
      roleId: role_id
    });

    // Manejar casos de error específicos
    if (!result.ok) {
      // NOT_ENOUGH_DATA → 422 Unprocessable Entity
      if (result.reason === 'NOT_ENOUGH_DATA') {
        return res.status(422).json(result);
      }

      // NO_VALID_KPIS → 422 Unprocessable Entity
      if (result.reason === 'NO_VALID_KPIS') {
        return res.status(422).json(result);
      }

      // MODEL_NOT_CONFIGURED → 503 Service Unavailable
      if (result.reason === 'INTERNAL_ERROR') {
        return res.status(503).json({
          ok: false,
          error: 'MODEL_NOT_AVAILABLE',
          message: 'El modelo de scoring no está configurado. Contacta al administrador.',
          details: result.message
        });
      }

      // ROLE_MISMATCH → 400 Bad Request
      if (result.reason === 'ROLE_MISMATCH') {
        return res.status(400).json(result);
      }

      // Otros errores → 500 Internal Server Error
      return res.status(500).json(result);
    }

    // Éxito → 200 OK
    return res.json(result);

  } catch (err) {
    logger.error('Failed to calculate HRKey Score', {
      requestId: req.requestId,
      subjectWallet: req.body.subject_wallet,
      roleId: req.body.role_id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'Error inesperado calculando HRKey Score.',
      details: err.message
    });
  }
});

/**
 * GET /api/hrkey-score/history?limit=10&user_id=
 * Get HRScore snapshot history for a user.
 *
 * Auth: User can view own history, superadmins can view any user
 *
 * Query params:
 * - limit: Max results (default: 10, max: 50)
 * - user_id: Optional user id (superadmin only)
 */
app.get('/api/hrkey-score/history', requireAuth, async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 50)
      : 10;

    const requestedUserId = req.query.user_id || req.user.id;
    const isSuperadmin = req.user.role === 'superadmin';

    if (!isSuperadmin && requestedUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'You can only view your own history'
      });
    }

    const history = await getScoreSnapshots({
      userId: requestedUserId,
      limit
    });

    return res.json({
      success: true,
      history,
      count: history.length,
      limit
    });
  } catch (err) {
    logger.error('Failed to get HRScore snapshot history', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch HRScore history'
    });
  }
});

/**
 * GET /api/hrkey-score/export?format=json&include_history=false&user_id=
 * Export HRScore data for a user.
 *
 * Auth: User can export own data, superadmins can export any user
 *
 * Query params:
 * - format: json | csv (default: json)
 * - include_history: boolean (default: false)
 * - user_id: Optional user id (superadmin only)
 */
app.get('/api/hrkey-score/export', requireAuth, async (req, res) => {
  try {
    const format = (req.query.format || 'json').toString().toLowerCase();
    const includeHistoryRaw = req.query.include_history;
    const includeHistory = ['true', '1', 'yes'].includes(
      (includeHistoryRaw ?? 'false').toString().toLowerCase()
    );

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format',
        message: 'format must be json or csv'
      });
    }

    const requestedUserId = req.query.user_id || req.user.id;
    const isSuperadmin = req.user.role === 'superadmin';

    if (!isSuperadmin && requestedUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'You can only export your own HRScore data'
      });
    }

    const { data: latestScore, error: latestScoreError } = await supabase
      .from('hrkey_scores')
      .select('score, created_at')
      .eq('user_id', requestedUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestScoreError) {
      logger.error('Failed to fetch latest HRScore for export', {
        requestId: req.requestId,
        userId: requestedUserId,
        error: latestScoreError.message
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to export HRScore'
      });
    }

    const exportPayload = {
      current_score: latestScore?.score ?? null,
      last_calculated_at: latestScore?.created_at ?? null
    };

    const fetchSnapshots = includeHistory || format === 'csv';
    let snapshots = [];

    if (fetchSnapshots) {
      const { data: snapshotData, error: snapshotError } = await supabase
        .from('hrscore_snapshots')
        .select('user_id, score, trigger_source, created_at')
        .eq('user_id', requestedUserId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (snapshotError) {
        logger.error('Failed to fetch HRScore snapshots for export', {
          requestId: req.requestId,
          userId: requestedUserId,
          error: snapshotError.message
        });
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: 'Failed to export HRScore'
        });
      }

      snapshots = snapshotData || [];
    }

    if (format === 'csv') {
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (/[",\n]/.test(stringValue)) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      const header = ['user_id', 'score', 'trigger_source', 'created_at'].join(',');
      const rows = snapshots.map((snapshot) => ([
        escapeCsvValue(snapshot.user_id),
        escapeCsvValue(snapshot.score),
        escapeCsvValue(snapshot.trigger_source),
        escapeCsvValue(snapshot.created_at)
      ].join(',')));
      const csvBody = [header, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('X-Current-Score', exportPayload.current_score ?? '');
      res.setHeader('X-Last-Calculated-At', exportPayload.last_calculated_at ?? '');
      return res.status(200).send(csvBody);
    }

    if (includeHistory) {
      exportPayload.history = snapshots;
    }

    return res.json({
      success: true,
      ...exportPayload
    });
  } catch (err) {
    logger.error('Failed to export HRScore', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to export HRScore'
    });
  }
});

/**
 * GET /api/hrkey-score/model-info
 * Get information about the loaded ML model
 *
 * Response:
 * {
 *   "ok": true,
 *   "model_type": "ridge",
 *   "trained_at": "2025-11-22T...",
 *   "role_scope": "global",
 *   "n_features": 8,
 *   "metrics": { "mae": 8234.56, "rmse": 10567.89, "r2": 0.7456 },
 *   "features": [
 *     { "name": "deployment_frequency", "coef": 12345.67, "abs_coef": 12345.67 },
 *     ...
 *   ],
 *   "target_stats": { "min": 65000, "max": 180000, "mean": 115234.5, "std": 28456.7 }
 * }
 *
 * Example:
 * curl http://localhost:3001/api/hrkey-score/model-info
 */
// SECURITY: Protect ML model metadata - superadmin only to prevent model extraction attacks
app.get('/api/hrkey-score/model-info', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const modelInfo = hrkeyScoreService.getModelInfo();
    return res.json(modelInfo);
  } catch (err) {
    logger.error('Failed to get HRKey Score model info', {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/* =========================
   HRSCORE PERSISTENCE & HISTORY ENDPOINTS
   ========================= */

/**
 * GET /api/hrscore/info
 * Get HRScore Persistence Layer metadata
 *
 * Auth: Authenticated users
 */
app.get('/api/hrscore/info', requireAuth, hrscoreController.getLayerInfoEndpoint);

/**
 * GET /api/hrscore/user/:userId/latest?roleId=
 * Get latest HRKey Score for a user
 *
 * Auth: User can view own scores, superadmins can view all
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" \
 *   http://localhost:3001/api/hrscore/user/USER_UUID/latest
 */
app.get('/api/hrscore/user/:userId/latest', requireAuth, hrscoreController.getLatestScoreEndpoint);

/**
 * GET /api/hrscore/user/:userId/history?roleId=&days=90
 * Get historical HRKey Scores for a user
 *
 * Auth: User can view own history, superadmins can view all
 *
 * Query params:
 * - roleId: Optional role filter
 * - days: Number of days to look back (default: 90)
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" \
 *   http://localhost:3001/api/hrscore/user/USER_UUID/history?days=30
 */
app.get('/api/hrscore/user/:userId/history', requireAuth, hrscoreController.getScoreHistoryEndpoint);

/**
 * GET /api/hrscore/user/:userId/improvement?roleId=&days=30
 * Calculate score improvement over a period
 *
 * Auth: User can view own improvement, superadmins can view all
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" \
 *   http://localhost:3001/api/hrscore/user/USER_UUID/improvement?days=30
 */
app.get('/api/hrscore/user/:userId/improvement', requireAuth, hrscoreController.getScoreImprovementEndpoint);

/**
 * GET /api/hrscore/user/:userId/stats?roleId=&days=90
 * Get statistical summary of user's scores
 *
 * Auth: User can view own stats, superadmins can view all
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" \
 *   http://localhost:3001/api/hrscore/user/USER_UUID/stats
 */
app.get('/api/hrscore/user/:userId/stats', requireAuth, hrscoreController.getScoreStatsEndpoint);

/**
 * GET /api/hrscore/user/:userId/evolution?roleId=&days=90
 * Get score evolution with rich analytics
 *
 * Auth: Superadmin only (contains advanced metrics)
 *
 * Example:
 * curl -H "Authorization: Bearer SUPERADMIN_TOKEN" \
 *   http://localhost:3001/api/hrscore/user/USER_UUID/evolution
 */
app.get('/api/hrscore/user/:userId/evolution', requireSuperadmin, hrscoreController.getScoreEvolutionEndpoint);

/**
 * POST /api/hrscore/calculate
 * Manually trigger HRScore calculation
 *
 * Auth: Superadmin only
 *
 * Body:
 * {
 *   userId: "uuid",
 *   roleId: "uuid" | null,
 *   triggerSource: "manual" | "api_request"
 * }
 *
 * Example:
 * curl -X POST http://localhost:3001/api/hrscore/calculate \
 *   -H "Authorization: Bearer SUPERADMIN_TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"userId": "USER_UUID", "roleId": null}'
 */
app.post('/api/hrscore/calculate', requireSuperadmin, hrscoreController.calculateScoreEndpoint);

/* =========================
   ANALYTICS ENDPOINTS (Superadmin only)
   ========================= */

/**
 * GET /api/analytics/dashboard
 * Get comprehensive analytics dashboard data
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 *
 * Returns aggregated metrics:
 * - Conversion funnel
 * - Demand trends
 * - Top candidates by activity
 * - Top companies by activity
 * - Overall event counts
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/dashboard?days=30
 */
app.get('/api/analytics/dashboard', requireSuperadmin, analyticsController.getAnalyticsDashboardEndpoint);

/**
 * GET /api/analytics/info
 * Get analytics layer metadata and capabilities
 *
 * Returns:
 * - Event types and categories
 * - Available metrics
 * - Layer version
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/info
 */
app.get('/api/analytics/info', requireSuperadmin, analyticsController.getAnalyticsInfoEndpoint);

/**
 * GET /api/analytics/candidates/activity
 * Get candidate activity metrics
 *
 * Query params:
 * - days: Number of days (default: 30)
 * - limit: Max results (default: 50)
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/candidates/activity?days=30&limit=50
 */
app.get('/api/analytics/candidates/activity', requireSuperadmin, analyticsController.getCandidateActivityEndpoint);

/**
 * GET /api/analytics/companies/activity
 * Get company activity and behavior metrics
 *
 * Query params:
 * - days: Number of days (default: 30)
 * - limit: Max results (default: 50)
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/companies/activity?days=30&limit=50
 */
app.get('/api/analytics/companies/activity', requireSuperadmin, analyticsController.getCompanyActivityEndpoint);

/**
 * GET /api/analytics/funnel
 * Get conversion funnel analysis
 *
 * Query params:
 * - days: Number of days (default: 30)
 *
 * Returns funnel stages with conversion rates:
 * - Signups → Companies Created → Data Requests → Approvals → Payments
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/funnel?days=30
 */
app.get('/api/analytics/funnel', requireSuperadmin, analyticsController.getConversionFunnelEndpoint);

/**
 * GET /api/analytics/demand-trends
 * Get market demand trends for skills and locations
 *
 * Query params:
 * - days: Number of days (default: 30)
 *
 * Returns:
 * - Top skills by search volume
 * - Top locations by search volume
 * - Active companies searching
 * - Total searches
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/demand-trends?days=30
 */
app.get('/api/analytics/demand-trends', requireSuperadmin, analyticsController.getDemandTrendsEndpoint);

/**
 * GET /api/analytics/skills/trending
 * Get trending skills analysis
 *
 * Query params:
 * - days: Number of days for recent period (default: 7)
 *
 * Returns skills trending up/down compared to previous period
 *
 * Example:
 * curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analytics/skills/trending?days=7
 */
app.get('/api/analytics/skills/trending', requireSuperadmin, analyticsController.getTrendingSkillsEndpoint);

/* =========================
   DEBUG ROUTE (Temporary - Remove after Sentry verification)
   ========================= */
// =======================================================
// Sentry Debug Route — ONLY ENABLED IN NON-PRODUCTION
// =======================================================
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', async (req, res) => {
    try {
      // Lanzamos un error intencional
      throw new Error("Ruta de prueba ejecutada en Render");
    } catch (error) {
      // Sentry captura el error
      if (sentryEnabled) {
        Sentry.captureException(error, scope => {
          scope.setTag('route', '/debug-sentry');
          scope.setTag('type', 'sentry_debug');
          scope.setContext('debug', {
            message: 'Ruta de prueba ejecutada en Render',
            url: req.originalUrl,
            method: req.method
          });
          return scope;
        });
      }

      res.status(500).json({
        message: "Error enviado a Sentry",
        error: error.message,
        sentryEnabled: sentryEnabled,
        timestamp: new Date().toISOString()
      });
    }
  });

  logger.info('Debug route /debug-sentry enabled', {
    environment: process.env.NODE_ENV
  });
}

/* =========================
   Export app for testing
   ========================= */
export default app;

/* =========================
   Start server (only if not in test mode)
   ========================= */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    logger.info('HRKey Backend started', {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      healthEndpoint: new URL('/health', BACKEND_PUBLIC_URL).toString(),
      frontendUrl: APP_URL,
      stripeMode: STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'
    });

    // Ensure superadmin is configured
    await ensureSuperadmin();
  });
}
