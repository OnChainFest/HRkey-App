const { getPublicBaseURL, buildVerifyLink } = require("./utils/appURL");
/** 
 * HRKEY BACKEND - Complete Service
 * 
 * Servicios:
 * - Wallet Creation (custodial wallets para social login)
 * - Reference Management (solicitar y completar referencias)
 * - Email Notifications
 * - User Stats & Analytics
 * 
 * Puerto por defecto: 3001
 */

import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

/* ================================
   CONFIGURACIÓN
   ================================ */

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://wrervcydgdrlcndtjboy.supabase.co';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzYxNTYsImV4cCI6MjA3MzU1MjE1Nn0.63M53sZW4LEYMOaxScvtLhQr_6VUj7rOaaGtlR745IM';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PORT = process.env.PORT || 3001;

/* ================================
   URL pública del FRONTEND (robusta)
   Prioridades:
   - PUBLIC_BASE_URL (recomendado, unificado)
   - BASE_URL        (alias común)
   - FRONTEND_URL    (muy común en Vercel)
   - PUBLIC_APP_URL  / APP_URL (variantes)
   - VERCEL_URL      (auto, sin protocolo)
   - Fallback        https://hrkey.xyz
   ================================ */

const PROD_URL = 'https://hrkey.xyz';

function resolveFrontendUrl() {
  const fromEnv =
    process.env.PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    null;

  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return PROD_URL;
}

// URL pública *unificada* para construir enlaces visibles por usuarios
const FRONTEND_URL = resolveFrontendUrl();

/** Helper consistente para armar link del referee (nunca localhost) */
function makeRefereeLink(token) {
  const url = new URL('/referee-evaluation-page.html', FRONTEND_URL);
  url.searchParams.set('ref', token);
  return url.toString();
}

// Email service (Resend)
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ================================
   WALLET CREATION SERVICE
   ================================ */

class WalletCreationService {
  static async createWalletForUser(userId, email) {
    try {
      if (!userId) throw new Error('userId is required');

      const existingWallet = await this.checkExistingWallet(userId);
      if (existingWallet) {
        console.log('✅ User already has a wallet:', existingWallet.address);
        return existingWallet;
      }

      const wallet = ethers.Wallet.createRandom();
      const encryptedPrivateKey = await this.encryptPrivateKey(wallet.privateKey, userId);

      const walletData = {
        user_id: userId,
        address: wallet.address,
        encrypted_private_key: encryptedPrivateKey,
        network: 'base-mainnet',
        wallet_type: 'custodial',
        is_active: true,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('user_wallets')
        .insert([walletData])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Wallet created successfully:', wallet.address);

      await this.initializeUserPlan(userId, wallet.address);

      return {
        address: wallet.address,
        network: 'base-mainnet',
        walletType: 'custodial',
        createdAt: walletData.created_at,
      };
    } catch (error) {
      console.error('❌ Error creating wallet:', error);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
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
    const planData = {
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
        canShareReferences: true,
      },
    //  payment_tx_hash: null,  // si lo usas luego, reagrégalo
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('user_plans').insert([planData]);
    if (error) throw error;

    console.log('✅ FREE plan initialized for user');
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

/* ================================
   REFERENCE MANAGEMENT SERVICE
   ================================ */

class ReferenceService {
  /** Crea una solicitud de referencia y envía correo al referee */
  static async createReferenceRequest(requestData) {
    try {
      const { userId, email, name, applicantData } = requestData || {};
      if (!userId) throw new Error('userId is required');
      if (!email) throw new Error('referee email is required');

      // Token único para la invitación
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Crear registro en reference_invites
      const inviteData = {
        requester_id: userId,
        referee_email: email,
        referee_name: name || null,
        invite_token: inviteToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
        created_at: new Date().toISOString(),
        metadata: applicantData || null,
      };

      const { data: invite, error: inviteError } = await supabase
        .from('reference_invites')
        .insert([inviteData])
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Actualizar contador de referencias solicitadas (si aplica)
      await this.updateUserStats(userId, 'references_requested');

      // Construir URL de verificación (nunca localhost)
      const verificationUrl = makeRefereeLink(inviteToken);

      // Enviar email al referee
      await this.sendRefereeInviteEmail(email, name, applicantData, verificationUrl);

      console.log('✅ Reference request created:', invite.id);

      return {
        success: true,
        reference_id: invite.id,
        token: inviteToken,
        verification_url: verificationUrl,
      };
    } catch (error) {
      console.error('❌ Error creating reference request:', error);
      throw error;
    }
  }

  /** Completa una referencia (cuando el referee la envía) */
  static async submitReference(submissionData) {
    try {
      const { token, refereeData, ratings, comments } = submissionData || {};
      if (!token) throw new Error('token is required');

      // Validar token
      const { data: invite, error: inviteError } = await supabase
        .from('reference_invites')
        .select('*')
        .eq('invite_token', token)
        .single();

      if (inviteError || !invite) {
        throw new Error('Invalid or expired invitation token');
      }
      if (invite.status === 'completed') {
        throw new Error('This reference has already been submitted');
      }

      // Guardar referencia completada
      const referenceData = {
        owner_id: invite.requester_id,
        referrer_name: invite.referee_name,
        referrer_email: invite.referee_email,
        relationship: invite.metadata?.relationship || 'colleague',
        summary: comments?.recommendation || '',
        overall_rating: this.calculateOverallRating(ratings),
        kpi_ratings: ratings || {},
        detailed_feedback: comments || {},
        status: 'active',
        created_at: new Date().toISOString(),
        invite_id: invite.id,
      };

      const { data: reference, error: refError } = await supabase
        .from('references')
        .insert([referenceData])
        .select()
        .single();

      if (refError) throw refError;

      // Actualizar invitación
      await supabase
        .from('reference_invites')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      // Stats y plan
      await this.updateUserStats(invite.requester_id, 'references_completed');
      await this.incrementReferencesUsed(invite.requester_id);

      // Notificar al solicitante
      await this.sendReferenceCompletedEmail(invite.requester_id, reference);

      console.log('✅ Reference submitted successfully:', reference.id);

      return { success: true, reference_id: reference.id };
    } catch (error) {
      console.error('❌ Error submitting reference:', error);
      throw error;
    }
  }

  /** Obtiene una referencia por token (para prellenar UI del referee) */
  static async getReferenceByToken(token) {
    try {
      const { data: invite, error } = await supabase
        .from('reference_invites')
        .select('*')
        .eq('invite_token', token)
        .single();

      if (error || !invite) {
        throw new Error('Invalid invitation token');
      }

      if (invite.status === 'completed') {
        return {
          success: false,
          message: 'This reference has already been completed',
          status: 'completed',
        };
      }

      if (new Date(invite.expires_at) < new Date()) {
        return {
          success: false,
          message: 'This invitation has expired',
          status: 'expired',
        };
      }

      return {
        success: true,
        invite: {
          referee_name: invite.referee_name,
          referee_email: invite.referee_email,
          applicant_data: invite.metadata,
          expires_at: invite.expires_at,
        },
      };
    } catch (error) {
      console.error('❌ Error getting reference:', error);
      throw error;
    }
  }

  /** Calcula rating general redondeado a 1 decimal */
  static calculateOverallRating(ratings) {
    const values = Object.values(ratings || {});
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + Number(val || 0), 0);
    return Math.round((sum / values.length) * 10) / 10;
  }

  // --- helpers de stats/plan (opcionales) ---
  static async updateUserStats(userId, statType) {
    console.log(`📊 Updated ${statType} for user ${userId}`);
  }

  static async incrementReferencesUsed(userId) {
    const { error } = await supabase.rpc('increment_reference_count', { p_user_id: userId });
    if (error) console.error('❌ Error incrementing reference count:', error);
  }

  // --- EMAILS (Resend) ---
  static async sendRefereeInviteEmail(email, name, applicantData, verificationUrl) {
    try {
      if (!RESEND_API_KEY) {
        console.warn('⚠️ RESEND_API_KEY not configured, skipping email');
        return;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'HRKey <noreply@hrkey.com>',
          to: email,
          subject: `Reference Request${applicantData?.applicantPosition ? ` - ${applicantData.applicantPosition}` : ''}`,
          html: `
            <h2>You've been asked to provide a professional reference</h2>
            <p>Hi ${name || ''},</p>
            <p>Someone has requested a reference from you${applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''}.</p>
            <p><strong>Click here to complete the reference:</strong></p>
            <a href="${verificationUrl}" style="background:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
              Complete Reference
            </a>
            <p>This link will expire in 30 days.</p>
            <p>Best regards,<br/>The HRKey Team</p>
          `,
        }),
      });

      if (!response.ok) {
        console.error('❌ Failed to send email:', await response.text());
      } else {
        console.log('✅ Invite email sent to', email);
      }
    } catch (error) {
      console.error('❌ Error sending email:', error);
    }
  }

  static async sendReferenceCompletedEmail(userId, reference) {
    try {
      if (!RESEND_API_KEY) return;

      const { data } = await supabase.auth.admin.getUserById(userId);
      const userEmail = data?.user?.email || data?.email;
      if (!userEmail) {
        console.warn('⚠️ User email not found for completion notification');
        return;
      }

      const dashboardUrl = new URL('/app.html', FRONTEND_URL).toString();

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'HRKey <noreply@hrkey.com>',
          to: userEmail,
          subject: 'Your reference has been completed!',
          html: `
            <h2>Great news! Your reference is ready</h2>
            <p><strong>${reference.referrer_name}</strong> has completed your professional reference.</p>
            <p><strong>Overall Rating:</strong> ${reference.overall_rating}/5 ⭐</p>
            <a href="${dashboardUrl}" style="background:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
              View Reference
            </a>
            <p>Best regards,<br/>The HRKey Team</p>
          `,
        }),
      });

      console.log('✅ Completion notification sent to', userEmail);
    } catch (error) {
      console.error('❌ Error sending notification:', error);
    }
  }
}

/* ================================
   EXPRESS API
   ================================ */

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'HRKey Backend Service',
    timestamp: new Date().toISOString(),
    services: {
      wallets: 'active',
      references: 'active',
      email: RESEND_API_KEY ? 'configured' : 'not configured',
    },
    frontend_url: FRONTEND_URL,
    base_rpc: BASE_RPC_URL,
  });
});

/* ================================
   WALLET ENDPOINTS
   ================================ */

app.post('/api/wallet/create', async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing userId or email' });
    }

    const wallet = await WalletCreationService.createWalletForUser(userId, email);

    res.json({
      success: true,
      wallet: {
        address: wallet.address,
        network: wallet.network,
        walletType: wallet.walletType,
      },
    });
  } catch (error) {
    console.error('Error in /api/wallet/create:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params || {};
    const wallet = await WalletCreationService.getUserWallet(userId);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ success: true, wallet });
  } catch (error) {
    console.error('Error in /api/wallet/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ================================
   REFERENCE ENDPOINTS
   ================================ */

/** Crea una nueva solicitud de referencia */
app.post('/api/reference/request', async (req, res) => {
  try {
    const result = await ReferenceService.createReferenceRequest(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/reference/request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Completa una referencia (referee submission) */
app.post('/api/reference/submit', async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/reference/submit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Obtiene detalles de invitación por token */
app.get('/api/reference/by-token/:token', async (req, res) => {
  try {
    const result = await ReferenceService.getReferenceByToken(req.params.token);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/reference/by-token/:token:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/* ================================
   START
   ================================ */

const BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL ||
  process.env.API_BASE_URL ||
  process.env.APP_BACKEND_URL ||
  getPublicBaseURL();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🚀 HRKey Backend Service                                ║
║  ✅ Running on ${BACKEND_PUBLIC_URL}                      ║
║  🌐 FRONTEND_URL: ${FRONTEND_URL}                         ║
║  📡 Supabase URL: ${SUPABASE_URL}                         ║
╚══════════════════════════════════════════════════════════╝
`);
});
