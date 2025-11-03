/**
 * HRKEY BACKEND - Complete Service
 * 
 * Servicios:
 * - Wallet Creation (custodial wallets para social login)
 * - Reference Management (solicitar y completar referencias)
 * - Email Notifications
 * - User Stats & Analytics
 * 
 * Puerto: 3001
 */

import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// ================================
// CONFIGURACIÓN
// ================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzYxNTYsImV4cCI6MjA3MzU1MjE1Nn0.63M53sZW4LEYMOaxScvtLhQr_6VUj7rOaaGtlR745IM';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PORT = process.env.PORT || 3001;

// URL base para el frontend (PROD/preview/local)
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000';

// Email service (Resend)
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ================================
// WALLET CREATION SERVICE
// ================================

class WalletCreationService {
  static async createWalletForUser(userId: string, email: string) {
    try {
      console.log(`🔧 Creating wallet for user ${userId} (${email})...`);

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
    } catch (error: any) {
      console.error('❌ Error creating wallet:', error);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  static async checkExistingWallet(userId: string) {
    const { data, error } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async encryptPrivateKey(privateKey: string, userId: string) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(userId, 'hrkey-salt-2025', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  static async initializeUserPlan(userId: string, walletAddress: string) {
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
      payment_tx_hash: null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('user_plans').insert([planData]);

    if (error) throw error;
    console.log('✅ FREE plan initialized for user');
  }

  static async getUserWallet(userId: string) {
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

// ================================
// REFERENCE MANAGEMENT SERVICE
// ================================

class ReferenceService {
  /**
   * Crea una solicitud de referencia
   */
  static async createReferenceRequest(requestData: any) {
    try {
      console.log('📨 Creating reference request...');

      const { userId, email, name, applicantData } = requestData;

      // Generar token único para la invitación
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Crear registro en reference_invites
      const inviteData = {
        requester_id: userId,
        referee_email: email,
        referee_name: name,
        invite_token: inviteToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
        created_at: new Date().toISOString(),
        metadata: applicantData,
      };

      const { data: invite, error: inviteError } = await supabase
        .from('reference_invites')
        .insert([inviteData])
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Actualizar contador de referencias solicitadas
      await this.updateUserStats(userId, 'references_requested');

      // Construir URL de verificación (NUEVO flujo)
      if (!BASE_URL) throw new Error('Missing NEXT_PUBLIC_BASE_URL/FRONTEND_URL');
      const verificationUrl = `${BASE_URL}/ref/verify?token=${encodeURIComponent(inviteToken)}`;

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

  /**
   * Completa una referencia (cuando el referee la envía)
   */
  static async submitReference(submissionData: any) {
    try {
      console.log('📝 Submitting reference...');

      const { token, refereeData, ratings, comments } = submissionData;

      // Verificar que el token sea válido
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

      // Guardar la referencia completada
      const referenceData = {
        owner_id: invite.requester_id,
        referrer_name: invite.referee_name,
        referrer_email: invite.referee_email,
        relationship: invite.metadata?.relationship || 'colleague',
        summary: comments?.recommendation || '',
        overall_rating: this.calculateOverallRating(ratings),
        kpi_ratings: ratings,
        detailed_feedback: comments,
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

      // Actualizar el estado de la invitación
      await supabase
        .from('reference_invites')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      // Actualizar stats del usuario
      await this.updateUserStats(invite.requester_id, 'references_completed');

      // Incrementar contador de referencias usadas en el plan
      await this.incrementReferencesUsed(invite.requester_id);

      // Notificar al solicitante
      await this.sendReferenceCompletedEmail(invite.requester_id, reference);

      console.log('✅ Reference submitted successfully:', reference.id);

      return {
        success: true,
        reference_id: reference.id,
      };
    } catch (error) {
      console.error('❌ Error submitting reference:', error);
      throw error;
    }
  }

  /**
   * Obtiene una referencia por token (para mostrar al referee)
   */
  static async getReferenceByToken(token: string) {
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

  /**
   * Calcula el rating general basado en todos los KPIs
   */
  static calculateOverallRating(ratings: Record<string, number>) {
    const values = Object.values(ratings || {});
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / values.length) * 10) / 10; // Redondear a 1 decimal
  }

  /**
   * Actualiza las estadísticas del usuario
   */
  static async updateUserStats(userId: string, statType: string) {
    // Aquí podrías tener una tabla de user_stats
    // Por ahora solo log
    console.log(`📊 Updated ${statType} for user ${userId}`);
  }

  /**
   * Incrementa el contador de referencias usadas
   */
  static async incrementReferencesUsed(userId: string) {
    const { error } = await supabase.rpc('increment_reference_count', { p_user_id: userId });

    if (error) {
      console.error('❌ Error incrementing reference count:', error);
    }
  }

  /**
   * Envía email de invitación al referee
   */
  static async sendRefereeInviteEmail(
    email: string,
    name: string,
    applicantData: any,
    verificationUrl: string
  ) {
    try {
      console.log(`📧 Sending invite email to ${email}...`);

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
          subject: `Reference Request from ${applicantData?.applicantName || 'a professional'}`,
          html: `
            <h2>You've been asked to provide a professional reference</h2>
            <p>Hi ${name},</p>
            <p>${applicantData?.applicantName || 'A professional'} has requested a reference from you${
            applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''
          }.</p>
            <p><strong>Click here to complete the reference:</strong></p>
            <a href="${verificationUrl}" style="background:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
              Complete Reference
            </a>
            <p>This link will expire in 30 days.</p>
            <p>Best regards,<br/>The HRKey Team</p>
          `,
        }),
      });

      if (response.ok) {
        console.log('✅ Email sent successfully');
      } else {
        console.error('❌ Failed to send email:', await response.text());
      }
    } catch (error) {
      console.error('❌ Error sending email:', error);
    }
  }

  /**
   * Notifica al solicitante que su referencia fue completada
   */
  static async sendReferenceCompletedEmail(userId: string, reference: any) {
    try {
      console.log(`📧 Notifying user ${userId} about completed reference...`);

      // Obtener email del usuario
      const { data } = await supabase.auth.admin.getUserById(userId);
      const user = (data as any)?.user;

      if (!user?.email || !RESEND_API_KEY) {
        console.warn('⚠️ User not found or email service not configured');
        return;
      }

      const dashboardUrl = `${BASE_URL}/app`; // ajusta la ruta si tu dashboard es distinto

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'HRKey <noreply@hrkey.com>',
          to: user.email,
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

      console.log('✅ Notification sent');
    } catch (error) {
      console.error('❌ Error sending notification:', error);
    }
  }
}

// ================================
// EXPRESS API
// ================================

const app = express();

// Middleware
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
    baseUrl: BASE_URL,
  });
});

// ================================
// WALLET ENDPOINTS
// ================================

app.post('/api/wallet/create', async (req, res) => {
  try {
    const { userId, email } = req.body;

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
  } catch (error: any) {
    console.error('Error in /api/wallet/create:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await WalletCreationService.getUserWallet(userId);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Error in /api/wallet/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================
// REFERENCE ENDPOINTS
// ================================

/**
 * POST /api/reference/request
 * Crea una nueva solicitud de referencia
 */
app.post('/api/reference/request', async (req, res) => {
  try {
    const result = await ReferenceService.createReferenceRequest(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/reference/request:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/reference/submit
 * Completa una referencia (referee submission)
 */
app.post('/api/reference/submit', async (req, res) => {
  try {
    const result = await ReferenceService.submitReference(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/reference/submit:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/reference/:referenceId
 * Obtiene información de una referencia por ID
 */
app.get('/api/reference/:referenceId', async (req, res) => {
  try {
    const { referenceId } = req.params;

    const { data: reference, error } = await supabase
      .from('reference_invites')
      .select('*')
      .eq('id', referenceId)
      .single();

    if (error || !reference) {
      return res.status(404).json({
        success: false,
        error: 'Reference not found',
      });
    }

    res.json({
      success: true,
      reference: {
        referee_name: reference.referee_name,
        referee_email: reference.referee_email,
        applicant_data: reference.metadata,
        status: reference.status,
      },
    });
  } catch (error: any) {
    console.error('Error in /api/reference/:referenceId:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/user/stats/:address
 * Obtiene estadísticas del usuario
 */
app.get('/api/user/stats/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const { data: references, error: refError } = await supabase
      .from('references')
      .select('*')
      .eq('owner_id', address);

    if (refError) throw refError;

    const stats = {
      totalReferences: references?.length || 0,
      verifiedOnChain: references?.filter((r: any) => r.status === 'active').length || 0,
      pendingValidations: 0,
      profileViews: 0,
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error in /api/user/stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║  🚀 HRKey Backend Service                            ║
    ║  ✅ Running on http://localhost:${PORT}                ║
    ║  📡 Connected to Supabase                            ║
    ║  💼 Wallets: ACTIVE                                  ║
    ║  📝 References: ACTIVE                               ║
    ║  📧 Email: ${RESEND_API_KEY ? 'CONFIGURED' : 'NOT CONFIGURED'}                         ║
    ║  🌐 BASE_URL: ${BASE_URL}                                 ║
    ╚══════════════════════════════════════════════════════╝
  `);
});

export { WalletCreationService, ReferenceService };
