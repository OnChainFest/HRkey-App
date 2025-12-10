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
import analyticsController from './controllers/analyticsController.js';
import hrkeyScoreService from './hrkeyScoreService.js';

// Import services
import * as webhookService from './services/webhookService.js';
import { validateReference as validateReferenceRVL } from './services/validation/index.js';
import { logEvent, EventTypes } from './services/analytics/eventTracker.js';

// Import logging
import logger, { requestIdMiddleware, requestLoggingMiddleware } from './logger.js';

// Import middleware
import {
  requireAuth,
  requireSuperadmin,
  requireCompanySigner
} from './middleware/auth.js';
import { validateBody, validateParams } from './middleware/validate.js';

// Import validation schemas
import { createWalletSchema, getWalletParamsSchema } from './schemas/wallet.schema.js';
import { createReferenceRequestSchema, submitReferenceSchema, getReferenceByTokenSchema } from './schemas/reference.schema.js';
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

class ReferenceService {
  static async createReferenceRequest({ userId, email, name, applicantData }) {
    const inviteToken = crypto.randomBytes(32).toString('hex');

    const inviteRow = {
      requester_id: userId,
      referee_email: email,
      referee_name: name,
      invite_token: inviteToken,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      metadata: applicantData || null
    };

    const { data: invite, error } = await supabase
      .from('reference_invites')
      .insert([inviteRow])
      .select()
      .single();

    if (error) throw error;

    // Construye SIEMPRE con base pública (nunca localhost)
    const verificationUrl = makeRefereeLink(inviteToken);

    // Log email sending without exposing the verification token
    logger.debug('Sending referee invitation email', {
      refereeEmail: email,
      requesterId: userId,
      inviteId: invite.id
    });

    await this.sendRefereeInviteEmail(email, name, applicantData, verificationUrl);

    return { success: true, reference_id: invite.id, token: inviteToken, verification_url: verificationUrl };
  }

  static async submitReference({ token, refereeData, ratings, comments }) {
    const { data: invite, error: invErr } = await supabase
      .from('reference_invites')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (invErr || !invite) throw new Error('Invalid or expired invitation token');
    if (invite.status === 'completed') throw new Error('This reference has already been submitted');

    const overall = this.calculateOverallRating(ratings);

    const refRow = {
      owner_id: invite.requester_id,
      referrer_name: invite.referee_name,
      referrer_email: invite.referee_email,
      relationship: invite.metadata?.relationship || 'colleague',
      summary: comments?.recommendation || '',
      overall_rating: overall,
      kpi_ratings: ratings,
      detailed_feedback: comments || {},
      status: 'active',
      created_at: new Date().toISOString(),
      invite_id: invite.id
    };

    const { data: reference, error: refErr } = await supabase
      .from('references')
      .insert([refRow])
      .select()
      .single();

    if (refErr) throw refErr;

    // ===== REFERENCE VALIDATION LAYER (RVL) INTEGRATION =====
    // Process reference through RVL (non-blocking - failures don't block submission)
    try {
      logger.info('Processing reference through RVL', { reference_id: reference.id });

      // Fetch previous references for consistency checking
      const { data: previousRefs } = await supabase
        .from('references')
        .select('summary, kpi_ratings, validated_data')
        .eq('owner_id', invite.requester_id)
        .neq('id', reference.id)
        .eq('status', 'active')
        .limit(10);

      // Validate the reference
      const validatedData = await validateReferenceRVL({
        summary: refRow.summary,
        kpi_ratings: refRow.kpi_ratings,
        detailed_feedback: refRow.detailed_feedback,
        owner_id: refRow.owner_id,
        referrer_email: refRow.referrer_email
      }, {
        previousReferences: previousRefs || [],
        skipEmbeddings: process.env.NODE_ENV === 'test' // Skip embeddings in tests
      });

      // Update reference with validated data
      await supabase
        .from('references')
        .update({
          validated_data: validatedData,
          validation_status: validatedData.validation_status,
          fraud_score: validatedData.fraud_score,
          consistency_score: validatedData.consistency_score,
          validated_at: new Date().toISOString()
        })
        .eq('id', reference.id);

      logger.info('RVL processing completed', {
        reference_id: reference.id,
        validation_status: validatedData.validation_status,
        fraud_score: validatedData.fraud_score
      });

    } catch (rvlError) {
      // RVL failure is non-fatal - log and continue
      logger.error('RVL processing failed, reference submitted without validation', {
        reference_id: reference.id,
        error: rvlError.message,
        stack: rvlError.stack
      });

      // Update reference to indicate validation failed
      await supabase
        .from('references')
        .update({
          validation_status: 'PENDING',
          validated_at: new Date().toISOString()
        })
        .eq('id', reference.id);
    }
    // ===== END RVL INTEGRATION =====

    await supabase
      .from('reference_invites')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Track analytics event (non-blocking)
    await logEvent({
      userId: invite.requester_id,
      eventType: EventTypes.REFERENCE_SUBMITTED,
      context: {
        referenceId: reference.id,
        overallRating: overall,
        referrerEmail: invite.referee_email,
        hasDetailedFeedback: !!(comments?.recommendation || comments?.strengths || comments?.improvements)
      }
    });

    await this.sendReferenceCompletedEmail(invite.requester_id, reference);

    return { success: true, reference_id: reference.id };
  }

  static async getReferenceByToken(token) {
    const { data: invite, error } = await supabase
      .from('reference_invites')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (error || !invite) throw new Error('Invalid invitation token');

    if (invite.status === 'completed') {
      return { success: false, message: 'This reference has already been completed', status: 'completed' };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return { success: false, message: 'This invitation has expired', status: 'expired' };
    }

    return {
      success: true,
      invite: {
        referee_name: invite.referee_name,
        referee_email: invite.referee_email,
        applicant_data: invite.metadata,
        expires_at: invite.expires_at
      }
    };
  }

  static calculateOverallRating(ratings) {
    const vals = Object.values(ratings || {});
    if (!vals.length) return 0;
    const sum = vals.reduce((a, b) => a + Number(b || 0), 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  static async sendRefereeInviteEmail(email, name, applicantData, verificationUrl) {
    if (!RESEND_API_KEY) {
      logger.warn('Email service not configured', {
        message: 'RESEND_API_KEY environment variable not set',
        action: 'skipping_email'
      });
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HRKey <noreply@hrkey.com>',
        to: email,
        subject: `Reference Request${applicantData?.applicantPosition ? ` - ${applicantData.applicantPosition}` : ''}`,
        html: `
          <div style="font-family:Rubik,Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 8px">You've been asked to provide a professional reference</h2>
            <p>Hi ${name || ''},</p>
            <p>Someone has requested a reference from you${applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''}.</p>
            <p><strong>Click here to complete the reference:</strong></p>
            <p>
              <a href="${verificationUrl}" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                Complete Reference
              </a>
            </p>
            <p>This link will expire in 30 days.</p>
            <p style="font-size:12px;color:#64748b">If the button doesn't work, copy and paste this link:<br>${verificationUrl}</p>
            <p>Best regards,<br/>The HRKey Team</p>
          </div>
        `
      })
    });
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Failed to send referee invitation email', {
        service: 'resend',
        statusCode: res.status,
        error: errorText,
        recipientEmail: email
      });
    }
  }

  static async sendReferenceCompletedEmail(userId, reference) {
    if (!RESEND_API_KEY) return;
    const { data: userRes } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userRes?.user?.email || userRes?.email;
    if (!userEmail) return;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HRKey <noreply@hrkey.com>',
        to: userEmail,
        subject: 'Your reference has been completed!',
        html: `
          <div style="font-family:Rubik,Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 8px">Great news! Your reference is ready</h2>
            <p>${reference.referrer_name} has completed your professional reference.</p>
            <p><strong>Overall Rating:</strong> ${reference.overall_rating}/5 ⭐</p>
            <p>
              <a href="${APP_URL}/app.html" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                View Reference
              </a>
            </p>
          </div>
        `
      })
    });
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
app.post('/api/reference/submit', tokenLimiter, validateBody(submitReferenceSchema), async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (e) {
    logger.error('Failed to submit reference', {
      requestId: req.requestId,
      token: req.body.token,
      error: e.message,
      stack: e.stack
    });
    res.status(500).json({ success: false, error: e.message });
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
      token: req.params.token,
      error: e.message,
      stack: e.stack
    });
    res.status(400).json({ success: false, error: e.message });
  }
});

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
app.get('/api/identity/status/:userId', requireAuth, identityController.getIdentityStatus);

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
app.post('/api/revenue/payout/request', requireAuth, revenueController.requestPayout);

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
// SECURITY: KPI observations require authentication to prevent data poisoning
app.post('/api/kpi-observations', requireAuth, kpiObservationsController.createKpiObservations);

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
app.post('/api/hrkey-score', requireAuth, async (req, res) => {
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
// SECURITY: Protect ML model metadata from unauthorized access
app.get('/api/hrkey-score/model-info', requireAuth, async (req, res) => {
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
