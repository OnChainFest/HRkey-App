/**
 * HRKEY BACKEND - Unified Service (ESM)
 * Wallets + References + Emails (Resend) + Stripe Payments
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import Stripe from 'stripe';
import { makeRefereeLink } from './utils/appUrl.js';

dotenv.config();

// ===== Config =====
const PORT = process.env.PORT || 3001;

// URL pública del frontend (UNIFICADA)
const APP_URL =
  process.env.APP_URL ||
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hrkey.xyz');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_reemplaza';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_reemplaza';

const stripe = new Stripe(STRIPE_SECRET_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============ Services ============

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

    // Siempre construimos con base pública (APP_URL) para evitar localhost
    const verificationUrl = makeRefereeLink(inviteToken, APP_URL);
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

// ============ App & Middleware ============

const app = express();

// Stripe webhook necesita body RAW; para el resto usamos JSON normal
app.use(cors());
app.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  return express.json()(req, res, next);
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'HRKey Backend Service',
    timestamp: new Date().toISOString(),
    email: RESEND_API_KEY ? 'configured' : 'not configured',
    app_url: APP_URL
  });
});

// ============ Wallet endpoints ============
app.post('/api/wallet/create', async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });
    const wallet = await WalletCreationService.createWalletForUser(userId, email);
    res.json({ success: true, wallet });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/:userId', async (req, res) => {
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

// ============ Reference endpoints ============
app.post('/api/reference/request', async (req, res) => {
  try {
    const result = await ReferenceService.createReferenceRequest(req.body);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reference/submit', async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/reference/by-token/:token', async (req, res) => {
  try {
    const result = await ReferenceService.getReferenceByToken(req.params.token);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// ============ Stripe Payments ============
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, email, promoCode } = req.body || {};
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount, // en centavos
      currency: 'usd',
      receipt_email: email || undefined,
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
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    console.log('✅ Payment succeeded:', pi.id, 'email:', pi.receipt_email, 'amount:', pi.amount / 100);
    // TODO: actualizar plan del usuario en Supabase
  }

  res.json({ received: true });
});

// ============ Start ============
app.listen(PORT, () => {
  console.log(`🚀 HRKey Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   APP_URL: ${APP_URL}`);
});

app.listen(PORT, () => {
  console.log(`🚀 HRKey Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
