/**
 * HRKEY SDK - Wallets + References (ESM)
 * Este archivo NO arranca servidor; exporta servicios para ser usados por tu backend.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';

// ================================
// CONFIG
// ================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

/**
 * 🌐 Selección robusta del dominio del frontend, evitando localhost:
 * 1) APP_URL (general)
 * 2) PUBLIC_APP_URL (recomendado en Vercel)
 * 3) FRONTEND_URL (compatibilidad)
 * 4) VERCEL_URL (auto)  -> https://<deploy>.vercel.app
 * 5) fallback           -> https://hrkey.xyz
 */
/**
 * 🌐 Selección robusta del dominio del frontend, evitando localhost:
 * 1) FRONTEND_URL (recomendado - configurar en producción) ✅ PRIORIDAD 1
 * 2) PUBLIC_APP_URL (compatibilidad Vercel)
 * 3) APP_URL (general)
 * 4) VERCEL_URL (auto)  -> https://<deploy>.vercel.app
 * 5) fallback           -> https://hrkey.xyz
 */
// ✅ Temporal - Forzar siempre producción
const PROD_URL = 'https://hrkey.xyz';
function getBaseURL() {
  // HARDCODED para testing - cambiar después
  return PROD_URL;
  
  // Descomentar después de configurar las env vars:
  // const envUrl =
  //   process.env.FRONTEND_URL ||
  //   process.env.PUBLIC_APP_URL ||
  //   process.env.APP_URL;
  // if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  // if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // return PROD_URL;
}
export const FRONTEND_URL = getBaseURL();

if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY no configurada. Operaciones de BD fallarán.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// -----------------------------------------
// Helper para construir el link del referee
// -----------------------------------------
function makeRefereeLink(token) {
  let base = FRONTEND_URL;
  if (base.endsWith('/')) base = base.slice(0, -1);
  return `${base}/referee-evaluation-page.html?token=${encodeURIComponent(token)}`;
}

// ====================================================================
// WALLET SERVICE
// ====================================================================

export class WalletCreationService {
  /**
   * Crea (o reutiliza) una wallet custodia para el usuario.
   */
  static async createWalletForUser(userId, email) {
    try {
      if (!userId) throw new Error('userId is required');

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

      const { data, error } = await supabase
        .from('user_wallets')
        .insert([row])
        .select()
        .single();

      if (error) throw error;

      await this.initializeUserPlan(userId, wallet.address);

      return {
        address: wallet.address,
        network: 'base-mainnet',
        walletType: 'custodial',
        createdAt: row.created_at
      };
    } catch (err) {
      console.error('❌ createWalletForUser error:', err);
      throw err;
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

// ====================================================================
// REFERENCE SERVICE
// ====================================================================

export class ReferenceService {
  /**
   * Crea una solicitud de referencia y envía email al referee.
   * requestData: { userId, email, name, applicantData }
   */
  static async createReferenceRequest(requestData) {
    try {
      const { userId, email, name, applicantData } = requestData || {};
      if (!userId) throw new Error('userId is required');
      if (!email) throw new Error('referee email is required');

      // Token único
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Guardar invitación
      const inviteRow = {
        requester_id: userId,
        referee_email: email,
        referee_name: name || null,
        invite_token: inviteToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
        created_at: new Date().toISOString(),
        metadata: applicantData || null
      };

      const { data: invite, error } = await supabase
        .from('reference_invites')
        .insert([inviteRow])
        .select()
        .single();

      if (error) throw error;

      // Link del correo (✅ sin localhost y con token seguro)
      const verificationUrl = makeRefereeLink(inviteToken);

      await this.sendRefereeInviteEmail(email, name, applicantData, verificationUrl);

      return {
        success: true,
        reference_id: invite.id,
        token: inviteToken,
        verification_url: verificationUrl
      };
    } catch (err) {
      console.error('❌ createReferenceRequest error:', err);
      throw err;
    }
  }

  /**
   * Envía los datos de la referencia completada por el referee.
   * submissionData: { token, refereeData, ratings, comments }
   */
  static async submitReference(submissionData) {
    try {
      const { token, refereeData, ratings, comments } = submissionData || {};
      if (!token) throw new Error('token is required');

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
        kpi_ratings: ratings || {},
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

      await this.updateUserStats(invite.requester_id, 'references_completed');
      await this.incrementReferencesUsed(invite.requester_id);

      await this.sendReferenceCompletedEmail(invite.requester_id, reference);

      return { success: true, reference_id: reference.id };
    } catch (err) {
      console.error('❌ submitReference error:', err);
      throw err;
    }
  }

  /**
   * Obtiene info básica de la invitación a partir del token (para prellenar UI).
   */
  static async getReferenceByToken(token) {
    try {
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
    } catch (err) {
      console.error('❌ getReferenceByToken error:', err);
      throw err;
    }
  }

  static calculateOverallRating(ratings) {
    const vals = Object.values(ratings || {});
    if (!vals.length) return 0;
    const sum = vals.reduce((a, b) => a + Number(b || 0), 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  // --- helpers de stats/plan (opcionales) ---
  static async updateUserStats(userId, statType) {
    console.log(`📊 Updated ${statType} for user ${userId}`);
  }

  static async incrementReferencesUsed(userId) {
    const { error } = await supabase.rpc('increment_reference_count', { p_user_id: userId });
    if (error) console.error('❌ incrementReferencesUsed error:', error);
  }

  // --- EMAILS (Resend) ---
  static async sendRefereeInviteEmail(email, name, applicantData, verificationUrl) {
    try {
      if (!RESEND_API_KEY) {
        console.warn('⚠️ RESEND_API_KEY not configured; skipping email.');
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
            <h2>You've been asked to provide a professional reference</h2>
            <p>Hi ${name || ''},</p>
            <p>Someone has requested a reference from you${applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''}.</p>
            <p><strong>Click here to complete the reference:</strong></p>
            <a href="${verificationUrl}" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
              Complete Reference
            </a>
            <p>This link will expire in 30 days.</p>
            <p>Best regards,<br/>The HRKey Team</p>
          `
        })
      });

      if (!res.ok) console.error('❌ Resend error:', await res.text());
      else console.log('✅ Invite email sent to', email);
    } catch (err) {
      console.error('❌ sendRefereeInviteEmail error:', err);
    }
  }

  static async sendReferenceCompletedEmail(userId, reference) {
    try {
      if (!RESEND_API_KEY) return;

      const { data: userRes } = await supabase.auth.admin.getUserById(userId);
      const userEmail = userRes?.user?.email || userRes?.email;
      if (!userEmail) return;

      const res = await fetch('https://api.resend.com/emails', {
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
            <h2>Great news! Your reference is ready</h2>
            <p>${reference.referrer_name} has completed your professional reference.</p>
            <p><strong>Overall Rating:</strong> ${reference.overall_rating}/5 ⭐</p>
            <a href="${FRONTEND_URL}/app.html" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
              View Reference
            </a>
          `
        })
      });

      if (!res.ok) console.error('❌ Resend (completed) error:', await res.text());
      else console.log('✅ Completion email sent to', userEmail);
    } catch (err) {
      console.error('❌ sendReferenceCompletedEmail error:', err);
    }
  }
}
