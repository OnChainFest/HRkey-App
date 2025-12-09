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
import hrkeyScoreService from './hrkeyScoreService.js';

// Import services
import * as webhookService from './services/webhookService.js';

// Import logging
import logger, { requestIdMiddleware } from './logger.js';

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

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_reemplaza';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_reemplaza';

const stripe = new Stripe(STRIPE_SECRET_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================
   Superadmin Auto-Assignment
   ========================= */
async function ensureSuperadmin() {
  const superadminEmail = process.env.HRKEY_SUPERADMIN_EMAIL;

  if (!superadminEmail) {
    console.warn('⚠️  HRKEY_SUPERADMIN_EMAIL not set. No superadmin will be assigned.');
    return;
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('email', superadminEmail)
      .single();

    if (error || !user) {
      console.warn(`⚠️  Superadmin email ${superadminEmail} not found in users table.`);
      return;
    }

    if (user.role !== 'superadmin') {
      await supabase
        .from('users')
        .update({ role: 'superadmin' })
        .eq('id', user.id);

      console.log(`✅ User ${superadminEmail} assigned role: superadmin`);
    } else {
      console.log(`✅ Superadmin ${superadminEmail} already configured`);
    }
  } catch (err) {
    console.error('❌ Error ensuring superadmin:', err.message);
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
    console.log('🧩 EMAIL VERIFICATION LINK:', verificationUrl);

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

    await supabase
      .from('reference_invites')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', invite.id);

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
      console.warn('RESEND_API_KEY not configured; skipping email.');
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
    if (!res.ok) console.error('Resend error:', await res.text());
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
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      FRONTEND_URL,
      'http://localhost:8000',
      'http://localhost:3000',
      'http://127.0.0.1:8000',
      'https://hrkey.xyz',
      'https://hrkey.vercel.app'
    ];

    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin });
      callback(null, true); // Allow anyway for now (can change to false in production)
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
const apiLimiter = rateLimit({
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

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 requests per IP per hour
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failed requests
});

// Auth-related rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per IP
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  return express.json()(req, res, next);
});

/* =========================
   Sentry Request & Tracing Handlers
   ========================= */
if (sentryEnabled) {
  // Request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());

  // Inject requestId and user context into Sentry scope
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
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Deep health check - includes Supabase connectivity check
// Returns degraded status if external services are unavailable
app.get('/health/deep', async (req, res) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    supabase: 'ok',
    details: null
  };

  try {
    // Lightweight Supabase ping with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase health check timeout')), 5000)
    );

    const checkPromise = supabase
      .from('users')
      .select('count')
      .limit(1);

    const { error } = await Promise.race([checkPromise, timeoutPromise]);

    if (error) {
      healthcheck.status = 'degraded';
      healthcheck.supabase = 'error';
      healthcheck.details = {
        supabase_error: error.message
      };
    }
  } catch (err) {
    healthcheck.status = 'degraded';
    healthcheck.supabase = 'error';
    healthcheck.details = {
      supabase_error: err.message
    };
  }

  // Return 200 even if degraded (service is still running)
  // Monitoring systems can check the status field for degradation
  res.status(200).json(healthcheck);
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
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/:userId', validateParams(getWalletParamsSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await WalletCreationService.getUserWallet(userId);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ success: true, wallet });
  } catch (e) {
    console.error(e);
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
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reference/submit', validateBody(submitReferenceSchema), async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/reference/by-token/:token', validateParams(getReferenceByTokenSchema), async (req, res) => {
  try {
    const result = await ReferenceService.getReferenceByToken(req.params.token);
    res.json(result);
  } catch (e) {
    console.error(e);
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
    console.error('Stripe error:', e);
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
app.get('/api/signers/invite/:token', signersController.getInvitationByToken); // Public - no auth
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
app.post('/api/kpi-observations', kpiObservationsController.createKpiObservations);

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
app.get('/api/kpi-observations', kpiObservationsController.getKpiObservations);

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
app.get('/api/kpi-observations/summary', kpiObservationsController.getKpiObservationsSummary);

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
app.post('/api/hrkey-score', async (req, res) => {
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
    console.error('❌ Error en /api/hrkey-score:', err);
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
app.get('/api/hrkey-score/model-info', async (req, res) => {
  try {
    const modelInfo = hrkeyScoreService.getModelInfo();
    return res.json(modelInfo);
  } catch (err) {
    console.error('❌ Error en /api/hrkey-score/model-info:', err);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/* =========================
   DEBUG ROUTE (Temporary - Remove after Sentry verification)
   ========================= */
// =======================================================
// Sentry Debug Route — Used only to test Sentry in Render
// =======================================================
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

/* =========================
   Sentry Error Handler
   ========================= */
// The Sentry error handler must be registered before any other error middleware
// and after all controllers
if (sentryEnabled) {
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only capture server errors (5xx), not client errors (4xx)
      const statusCode = error.status || error.statusCode || 500;
      return statusCode >= 500;
    }
  }));
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
