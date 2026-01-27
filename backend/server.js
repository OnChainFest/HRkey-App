/**
 * HRKEY BACKEND - Unified Service (ESM)
 * Wallets + References + Emails (Resend) + Stripe Payments
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import helmet from 'helmet';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import Stripe from 'stripe';
import { makeRefereeLink as makeRefereeLinkUtil, getFrontendBaseURL } from './utils/appUrl.js';
import * as Sentry from '@sentry/node';

// Import new controllers
import identityController from './controllers/identityController.js';
import companyController from './controllers/companyController.js';
import signersController from './controllers/signersController.js';
import auditController from './controllers/auditController.js';
import dataAccessController from './controllers/dataAccessController.js';
import kpiObservationsController from './controllers/kpiObservationsController.js';
import candidateEvaluationController from './controllers/candidateEvaluation.controller.js';
import tokenomicsPreviewController from './controllers/tokenomicsPreview.controller.js';
import publicProfileController from './controllers/publicProfile.controller.js';
import publicIdentifierController from './controllers/publicIdentifier.controller.js';
import adminOverviewController from './controllers/adminOverview.controller.js';
import analyticsController from './controllers/analyticsController.js';
import hrscoreController from './controllers/hrscoreController.js';
import referencesController from './controllers/referencesController.js';
import aiRefineController from './controllers/aiRefine.controller.js';
import walletsController from './controllers/walletsController.js';
import notificationsController from './controllers/notificationsController.js';
import billingController from './controllers/billingController.js';
import hrkeyScoreService from './hrkeyScoreService.js';
import { getScoreSnapshots } from './services/hrscore/scoreSnapshots.js';

// Import services
import * as webhookService from './services/webhookService.js';
import { ReferenceService, hashInviteToken } from './services/references.service.js';
import { checkReferenceAllowance, consumeReferenceAllowance } from './services/referenceGating.service.js';

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
  respondReferenceSchema
} from './schemas/reference.schema.js';
import { createPaymentIntentSchema } from './schemas/payment.schema.js';
import { refineReferenceSchema } from './schemas/aiRefine.schema.js';
import { connectWalletSchema } from './schemas/wallets.schema.js';
import { createCheckoutSessionSchema } from './schemas/billing.schema.js';

dotenv.config();

/* =========================
   Feature Flags
   ========================= */
// Kill switch for reference hiding feature
// Set ENABLE_REFERENCE_HIDING=false in .env to disable
const ENABLE_REFERENCE_HIDING = process.env.ENABLE_REFERENCE_HIDING !== 'false';

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
    integrations: (integrations) => [...integrations],
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0')
  });
}

/* =========================
   URL helpers (robustos)
   ========================= */
const PROD_URL = 'https://hrkey.xyz';

function getPublicBaseURL() {
  const fromEnv =
    process.env.PUBLIC_BASE_URL || // recomendado (unificado)
    process.env.BASE_URL || // alias común
    process.env.FRONTEND_URL || // a veces ya lo tienes así en Vercel
    process.env.PUBLIC_APP_URL || // variantes históricas
    process.env.APP_URL || // si lo usas para front
    null;

  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return PROD_URL;
}

// URL pública del frontend (UNIFICADA para construir links que verán usuarios)
const APP_URL = getFrontendBaseURL() || getPublicBaseURL();

/** Wrapper seguro: si el util existe, úsalo; si no, construye aquí. */
function makeRefereeLink(token) {
  try {
    if (typeof makeRefereeLinkUtil === 'function') {
      const url = makeRefereeLinkUtil(token);
      if (url && /^https?:\/\//i.test(url)) return url;
    }
  } catch (_) {
    /* fall back */
  }

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

// ✅ Admin key (para rutas /api/admin/* sin Supabase JWT)
//   Preferí HRKEY_ADMIN_KEY como nombre “final”, pero dejamos fallback a ADMIN_KEY.
const HRKEY_ADMIN_KEY = process.env.HRKEY_ADMIN_KEY || process.env.ADMIN_KEY;

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
    logger.warn(`${message} - Using test mode`, {
      environment: process.env.NODE_ENV
    });
  }
}

const stripe = new Stripe(STRIPE_SECRET_KEY || 'sk_test_placeholder');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================
   Admin Key Middleware (NO JWT)
   ========================= */
/**
 * Permite auth para endpoints admin SIN depender de Supabase JWT.
 *
 * Uso:
 *  - Query string: ?admin_key=...
 *  - Header: x-admin-key: ...
 *
 * Nota:
 *  - En Express/Node, los headers llegan en minúscula (req.headers['x-admin-key']).
 *  - NO sirve intentar mandar "x-admin-key=..." en la URL como query param.
 */
function requireAdminKey(req, res, next) {
  // En test, permitimos si no está configurada (opcional).
  if (process.env.NODE_ENV === 'test' && !HRKEY_ADMIN_KEY) return next();

  if (!HRKEY_ADMIN_KEY || HRKEY_ADMIN_KEY.length < 16) {
    logger.error('Admin key not configured or too short', {
      hasAdminKey: !!HRKEY_ADMIN_KEY,
      length: HRKEY_ADMIN_KEY?.length
    });
    return res.status(503).json({
      error: 'Admin auth not configured',
      message: 'HRKEY_ADMIN_KEY is not configured on server'
    });
  }

  const provided =
    (req.query?.admin_key ? String(req.query.admin_key) : null) ||
    (req.headers['x-admin-key'] ? String(req.headers['x-admin-key']) : null);

  if (!provided) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide admin_key query param or x-admin-key header'
    });
  }

  try {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(HRKEY_ADMIN_KEY, 'utf8');

    // timingSafeEqual requiere misma longitud
    if (a.length !== b.length) {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid admin key' });
    }

    const ok = crypto.timingSafeEqual(a, b);
    if (!ok) {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid admin key' });
    }

    // Tag request as admin for logs/observability
    req.isAdminKeyAuth = true;
    return next();
  } catch (e) {
    return res.status(403).json({ error: 'Forbidden', message: 'Invalid admin key' });
  }
}

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
      await supabase.from('users').update({ role: 'superadmin' }).eq('id', user.id);

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
    return `${iv.toString('hex')}:${encrypted}`;
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
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      FRONTEND_URL,
      'http://localhost:8000',
      'http://localhost:3000',
      'http://127.0.0.1:8000',
      'https://hrkey.xyz',
      'https://www.hrkey.xyz',
      'https://hrkey.vercel.app'
    ];

    const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed));

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn('CORS policy violation', {
        origin,
        environment: process.env.NODE_ENV,
        blocked: IS_PRODUCTION
      });

      if (IS_PRODUCTION) {
        callback(new Error('CORS policy: Origin not allowed'));
      } else {
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // ✅ allow common headers + admin header (preflight)
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'X-Admin-Key']
};

// Stripe webhook necesita body RAW; para el resto usamos JSON normal
app.use(cors(corsOptions));
// ✅ handle preflight for all routes
app.options('*', cors(corsOptions));

// Request ID middleware for request correlation
app.use(requestIdMiddleware);

// HTTP request/response logging with structured data
app.use(requestLoggingMiddleware);

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.coinbase.com', 'https://js.stripe.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: [
          "'self'",
          'https://mainnet.base.org',
          'https://sepolia.base.org',
          'https://*.supabase.co',
          'https://api.stripe.com'
        ],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        fontSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:']
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// Rate limiting configuration
const rateLimitWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

const apiLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: Number.parseInt(process.env.RATE_LIMIT_API_MAX || '300', 10),
  keyPrefix: 'api'
});

const strictLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: Number.parseInt(process.env.RATE_LIMIT_STRICT_MAX || '10', 10),
  keyPrefix: 'strict'
});

const authLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20', 10),
  keyPrefix: 'auth'
});

const tokenLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: Number.parseInt(process.env.RATE_LIMIT_TOKEN_MAX || '30', 10),
  keyPrefix: 'token'
});

const hrscoreLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: Number.parseInt(process.env.RATE_LIMIT_HRSCORE_MAX || '60', 10),
  keyPrefix: 'hrscore'
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

// Apply auth rate limiting
app.use('/api/auth', authLimiter);

// Apply HRScore rate limiting
app.use('/api/hrkey-score', hrscoreLimiter);
app.use('/api/hrscore', hrscoreLimiter);

// JSON body parsing with size limits (DoS protection)
app.use((req, res, next) => {
  // Stripe webhook needs raw body
  if (req.path === '/webhook') return next();

  return express.json({
    limit: '1mb',
    strict: true,
    verify: (req, buf) => {
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
  app.use((req, res, next) => {
    const requestId = req.requestId || res.locals.requestId;
    if (requestId) Sentry.setTag('request_id', requestId);

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

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase health check timeout')), 5000)
    );

    const checkPromise = supabase.from('users').select('count').limit(1);

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
      healthcheck.checks.supabase = { status: 'ok', responseTime: supabaseResponseTime };
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
      healthcheck.checks.stripe = { status: 'ok', configured: true };
    }
  } catch (err) {
    healthcheck.status = healthcheck.status === 'ok' ? 'degraded' : healthcheck.status;
    healthcheck.checks.stripe = {
      status: 'error',
      configured: false,
      error: err.message
    };
  }

  const httpStatus = healthcheck.status === 'error' ? 503 : 200;
  res.status(httpStatus).json(healthcheck);
});

/* =========================
   Wallet endpoints
   ========================= */
app.post('/api/wallet/create', requireAuth, strictLimiter, validateBody(createWalletSchema), async (req, res) => {
  try {
    const { userId, email } = req.body;

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

    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only request references for yourself'
      });
    }

    // Reference Gating: Check if user can request a reference
    const allowance = await checkReferenceAllowance(userId);

    if (!allowance.allowed) {
      // User has used free reference and has no paid allowance
      logger.info('Reference request blocked - payment required', {
        requestId: req.requestId,
        userId,
        reason: allowance.reason
      });
      return res.status(402).json({
        error: 'PAYMENT_REQUIRED',
        product_code: 'additional_reference'
      });
    }

    // Create the reference request
    const result = await ReferenceService.createReferenceRequest(req.body);

    // Consume the allowance after successful creation
    if (allowance.consumeType) {
      const consumeResult = await consumeReferenceAllowance(
        userId,
        allowance.consumeType,
        allowance.flagId
      );

      if (!consumeResult.success) {
        // Log but don't fail the request - reference was created
        logger.warn('Failed to consume reference allowance', {
          requestId: req.requestId,
          userId,
          consumeType: allowance.consumeType,
          error: consumeResult.error
        });
      }
    }

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
 */
app.get('/api/references/me', requireAuth, referencesController.getMyReferences);

/**
 * GET /api/references/pending
 */
app.get('/api/references/pending', requireAuth, referencesController.getMyPendingInvites);

/**
 * GET /api/references/candidate/:candidateId
 */
app.get('/api/references/candidate/:candidateId', requireAuth, referencesController.getCandidateReferences);

/**
 * POST /api/references/:referenceId/hide
 * Hide a reference (strikethrough in public views)
 * Feature flag: ENABLE_REFERENCE_HIDING
 */
if (ENABLE_REFERENCE_HIDING) {
} else {
  // Feature disabled - return 503 Service Unavailable
  app.post('/api/references/:referenceId/hide', requireAuth, (req, res) => {
    logger.warn('Reference hiding feature is disabled', {
      requestId: req.requestId,
      userId: req.user?.id,
      referenceId: req.params.referenceId
    });
    return res.status(503).json({
      ok: false,
      error: 'FEATURE_DISABLED',
      message: 'Reference hiding is temporarily disabled'
    });
  });

  app.post('/api/references/:referenceId/unhide', requireAuth, (req, res) => {
    logger.warn('Reference hiding feature is disabled', {
      requestId: req.requestId,
      userId: req.user?.id,
      referenceId: req.params.referenceId
    });
    return res.status(503).json({
      ok: false,
      error: 'FEATURE_DISABLED',
      message: 'Reference hiding is temporarily disabled'
    });
  });
}

/* =========================
   References workflow MVP
   ========================= */
app.post(
  '/api/references/request',
  requireAuth,
  validateBody422(createReferenceInviteSchema),
  referencesController.requestReferenceInvite
);

app.post(
  '/api/references/respond/:token',
  tokenLimiter,
  optionalAuth,
  validateParams(getReferenceByTokenSchema),
  validateBody422(respondReferenceSchema),
  referencesController.respondToReferenceInvite
);

/* =========================
   AI Reference Refinement
   ========================= */
app.post(
  '/api/ai/reference/refine',
  requireAuth,
  strictLimiter,
  validateBody(refineReferenceSchema),
  aiRefineController.refineReference
);

/* =========================
   Wallets (Identity Only)
   ========================= */
app.post(
  '/api/wallets/connect',
  requireAuth,
  strictLimiter,
  validateBody(connectWalletSchema),
  walletsController.connectWallet
);
app.get('/api/wallets/me', requireAuth, walletsController.getMyWallet);

/* =========================
   Notifications (In-App Only)
   ========================= */
app.get('/api/notifications', requireAuth, notificationsController.getNotifications);
app.post('/api/notifications/:id/read', requireAuth, notificationsController.markAsRead);

/* =========================
   Billing (Stripe Checkout)
   ========================= */
app.post(
  '/api/billing/create-checkout-session',
  requireAuth,
  authLimiter,
  validateBody(createCheckoutSessionSchema),
  billingController.createCheckoutSession
);

/* =========================
   Stripe Payments
   ========================= */
app.post('/create-payment-intent', requireAuth, authLimiter, validateBody(createPaymentIntentSchema), async (req, res) => {
  try {
    const { amount, email, promoCode } = req.body;

    const receiptEmail = email || req.user.email;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      receipt_email: receiptEmail,
      metadata: { promoCode: promoCode || 'none', plan: 'pro-lifetime' },
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

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    reqLogger.error('Webhook signature verification failed', {
      error: err.message,
      hasSignature: !!sig
    });

    if (sentryEnabled) {
      Sentry.captureException(err, (scope) => {
        scope.setTag('controller', 'webhook');
        scope.setTag('route', 'POST /webhook');
        scope.setTag('error_type', 'signature_verification');
        scope.setContext('webhook', { hasSignature: !!sig, path: req.path });
        return scope;
      });
    }

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const alreadyProcessed = await webhookService.isEventProcessed(event.id);
    if (alreadyProcessed) {
      reqLogger.info('Event already processed, skipping (idempotency)', {
        eventId: event.id,
        eventType: event.type
      });
      return res.json({ received: true, idempotent: true });
    }

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

      case 'checkout.session.completed': {
        const session = event.data.object;
        reqLogger.info('Processing checkout.session.completed', {
          sessionId: session.id,
          customerEmail: session.customer_email,
          metadata: session.metadata
        });

        const result = await billingController.handleCheckoutSessionCompleted(session);

        if (result.success) {
          reqLogger.info('Checkout session processed successfully', {
            sessionId: session.id,
            userId: result.userId,
            productCode: result.productCode
          });
        } else {
          reqLogger.warn('Checkout session processed with issues', {
            sessionId: session.id,
            reason: result.reason
          });
        }

        await webhookService.markEventProcessed(event.id, event.type, {
          session_id: session.id,
          success: result.success
        });

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        reqLogger.info('Processing checkout.session.expired', {
          sessionId: session.id
        });

        await billingController.handleCheckoutSessionExpired(session);
        await webhookService.markEventProcessed(event.id, event.type, {
          session_id: session.id
        });

        break;
      }

      default:
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

    if (sentryEnabled) {
      Sentry.captureException(error, (scope) => {
        scope.setTag('controller', 'webhook');
        scope.setTag('route', 'POST /webhook');
        scope.setTag('error_type', 'processing_error');
        scope.setContext('webhook', { eventId: event?.id, eventType: event?.type });
        return scope;
      });
    }

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/* =========================
   IDENTITY & PERMISSIONS ENDPOINTS (New)
   ========================= */

// ===== IDENTITY ENDPOINTS =====
app.post('/api/identity/verify', authLimiter, requireAuth, identityController.verifyIdentity);
app.get(
  '/api/identity/status/:userId',
  requireAuth,
  requireSelfOrSuperadmin('userId', { message: 'You can only view your own identity status' }),
  identityController.getIdentityStatus
);

// ===== CANDIDATE EVALUATION ENDPOINT =====
app.get('/api/candidates/:userId/evaluation', requireAuth, candidateEvaluationController.getCandidateEvaluation);
app.get('/api/candidates/:userId/tokenomics-preview', requireAuth, tokenomicsPreviewController.getTokenomicsPreview);
app.get('/api/me/public-identifier', requireAuth, publicIdentifierController.getMyPublicIdentifier);
app.get('/api/public/candidates/:identifier', publicProfileController.getPublicCandidateProfile);

// ===== COMPANY ENDPOINTS =====
app.post('/api/company/create', requireAuth, companyController.createCompany);
app.get('/api/companies/my', requireAuth, companyController.getMyCompanies);
app.get('/api/company/:companyId', requireAuth, requireCompanySigner, companyController.getCompany);
app.patch('/api/company/:companyId', requireAuth, requireCompanySigner, companyController.updateCompany);
app.post('/api/company/:companyId/verify', requireAuth, requireSuperadmin, companyController.verifyCompany);

// ===== COMPANY SIGNERS ENDPOINTS =====
app.post(
  '/api/company/:companyId/signers',
  strictLimiter,
  requireAuth,
  requireCompanySigner,
  signersController.inviteSigner
);
app.get('/api/company/:companyId/signers', requireAuth, requireCompanySigner, signersController.getSigners);
app.patch(
  '/api/company/:companyId/signers/:signerId',
  requireAuth,
  requireCompanySigner,
  signersController.updateSigner
);
app.get('/api/company/:companyId/data-access/requests', requireAuth, requireCompanySigner, dataAccessController.getCompanyRequests);

// Signer invitation endpoints
app.get('/api/signers/invite/:token', tokenLimiter, signersController.getInvitationByToken);
app.post('/api/signers/accept/:token', requireAuth, signersController.acceptSignerInvitation);

// ===== AUDIT LOG ENDPOINTS =====
app.get('/api/audit/logs', requireAuth, auditController.getAuditLogs);
app.get('/api/audit/recent', requireAuth, auditController.getRecentActivity);

// ✅ ADMIN OVERVIEW (NO JWT) - usa admin_key / x-admin-key
// ✅ AÑADIMOS strictLimiter para evitar abuso (además de apiLimiter global)
app.get('/api/admin/overview', strictLimiter, requireAdminKey, adminOverviewController.getAdminOverviewHandler);

// ===== DATA ACCESS ENDPOINTS (Pay-per-query) =====
app.post('/api/data-access/request', requireAuth, dataAccessController.createDataAccessRequest);
app.get('/api/data-access/pending', requireAuth, dataAccessController.getPendingRequests);
app.get('/api/data-access/request/:requestId', requireAuth, dataAccessController.getRequestById);
app.post('/api/data-access/:requestId/approve', requireAuth, dataAccessController.approveDataAccessRequest);
app.post('/api/data-access/:requestId/reject', requireAuth, dataAccessController.rejectDataAccessRequest);
app.get('/api/data-access/:requestId/data', requireAuth, dataAccessController.getDataByRequestId);

/* =========================
   KPI OBSERVATIONS ENDPOINTS (Proof of Correlation MVP)
   ========================= */
app.post(
  '/api/kpi-observations',
  requireAuth,
  requireWalletLinked({ message: 'You must have a linked wallet to submit KPI observations' }),
  kpiObservationsController.createKpiObservations
);
app.get('/api/kpi-observations', requireAuth, kpiObservationsController.getKpiObservations);
app.get('/api/kpi-observations/summary', requireAuth, kpiObservationsController.getKpiObservationsSummary);

/* =========================
   HRKEY SCORE ENDPOINTS (ML-powered scoring)
   ========================= */
app.post(
  '/api/hrkey-score',
  requireAuth,
  requireOwnWallet('subject_wallet', {
    noWalletMessage: 'You must have a linked wallet to calculate scores',
    mismatchMessage: 'You can only calculate HRKey Score for your own wallet'
  }),
  async (req, res) => {
    try {
      const { subject_wallet, role_id } = req.body;

      if (!subject_wallet || !role_id) {
        return res.status(400).json({
          ok: false,
          error: 'MISSING_FIELDS',
          message: 'Se requieren subject_wallet y role_id.',
          required: ['subject_wallet', 'role_id']
        });
      }

      const result = await hrkeyScoreService.computeHrkeyScore({
        subjectWallet: subject_wallet,
        roleId: role_id
      });

      if (!result.ok) {
        if (result.reason === 'NOT_ENOUGH_DATA') return res.status(422).json(result);
        if (result.reason === 'NO_VALID_KPIS') return res.status(422).json(result);

        if (result.reason === 'INTERNAL_ERROR') {
          return res.status(503).json({
            ok: false,
            error: 'MODEL_NOT_AVAILABLE',
            message: 'El modelo de scoring no está configurado. Contacta al administrador.',
            details: result.message
          });
        }

        if (result.reason === 'ROLE_MISMATCH') return res.status(400).json(result);
        return res.status(500).json(result);
      }

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
  }
);

app.get('/api/hrkey-score/history', requireAuth, async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;

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
      const rows = snapshots.map((snapshot) =>
        [
          escapeCsvValue(snapshot.user_id),
          escapeCsvValue(snapshot.score),
          escapeCsvValue(snapshot.trigger_source),
          escapeCsvValue(snapshot.created_at)
        ].join(',')
      );
      const csvBody = [header, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('X-Current-Score', exportPayload.current_score ?? '');
      res.setHeader('X-Last-Calculated-At', exportPayload.last_calculated_at ?? '');
      return res.status(200).send(csvBody);
    }

    if (includeHistory) exportPayload.history = snapshots;

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

app.get('/api/hrscore/info', requireAuth, hrscoreController.getLayerInfoEndpoint);
app.get('/api/hrscore/user/:userId/latest', requireAuth, hrscoreController.getLatestScoreEndpoint);
app.get('/api/hrscore/user/:userId/history', requireAuth, hrscoreController.getScoreHistoryEndpoint);
app.get('/api/hrscore/user/:userId/improvement', requireAuth, hrscoreController.getScoreImprovementEndpoint);
app.get('/api/hrscore/user/:userId/stats', requireAuth, hrscoreController.getScoreStatsEndpoint);
app.get('/api/hrscore/user/:userId/evolution', requireSuperadmin, hrscoreController.getScoreEvolutionEndpoint);
app.post('/api/hrscore/calculate', requireSuperadmin, hrscoreController.calculateScoreEndpoint);

/* =========================
   ANALYTICS ENDPOINTS (Superadmin only)
   ========================= */
app.get('/api/analytics/dashboard', requireSuperadmin, analyticsController.getAnalyticsDashboardEndpoint);
app.get('/api/analytics/info', requireSuperadmin, analyticsController.getAnalyticsInfoEndpoint);
app.get('/api/analytics/candidates/activity', requireSuperadmin, analyticsController.getCandidateActivityEndpoint);
app.get('/api/analytics/companies/activity', requireSuperadmin, analyticsController.getCompanyActivityEndpoint);
app.get('/api/analytics/funnel', requireSuperadmin, analyticsController.getConversionFunnelEndpoint);
app.get('/api/analytics/demand-trends', requireSuperadmin, analyticsController.getDemandTrendsEndpoint);
app.get('/api/analytics/skills/trending', requireSuperadmin, analyticsController.getTrendingSkillsEndpoint);

/* =========================
   DEBUG ROUTE (Temporary - Remove after Sentry verification)
   ========================= */
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', async (req, res) => {
    try {
      throw new Error('Ruta de prueba ejecutada en Render');
    } catch (error) {
      if (sentryEnabled) {
        Sentry.captureException(error, (scope) => {
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
        message: 'Error enviado a Sentry',
        error: error.message,
        sentryEnabled,
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
      stripeMode: STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST'
    });

    await ensureSuperadmin();
  });
}
