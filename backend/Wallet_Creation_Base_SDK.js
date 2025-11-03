// backend/Wallet_Creation_Base_SDK.js

import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import crypto from 'crypto';

// ================================
// CONFIG
// ================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// URL base del frontend (prod/preview/local) – USAR SIEMPRE ESTA
export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000';

// Email (Resend)
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ================================
// Wallet helpers
// ================================
export async function createCustodialWallet(userId) {
  // Reutiliza si ya existe
  const { data: existing, error: existErr } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (existErr) throw existErr;
  if (existing) return existing;

  const wallet = ethers.Wallet.createRandom();
  const encrypted_private_key = await encryptPrivateKey(wallet.privateKey, userId);

  const row = {
    user_id: userId,
    address: wallet.address,
    encrypted_private_key,
    network: 'base-mainnet',
    wallet_type: 'custodial',
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_wallets')
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function encryptPrivateKey(pk, userId) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(userId, 'hrkey-salt-2025', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(pk, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

// ================================
// Reference Invites
// ================================
export async function createReferenceInvite({
  requesterId,
  refereeEmail,
  refereeName,
  applicantData = {},
  expiresInDays = 30,
}) {
  const invite_token = crypto.randomBytes(32).toString('hex');

  const row = {
    requester_id: requesterId,
    referee_email: refereeEmail,
    referee_name: refereeName,
    invite_token,
    status: 'pending',
    expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    metadata: applicantData,
  };

  const { data: invite, error } = await supabase
    .from('reference_invites')
    .insert([row])
    .select()
    .single();

  if (error) throw error;

  // ENLACE CANÓNICO (nuevo flujo)
  const verifyUrl = `${BASE_URL}/ref/verify?token=${encodeURIComponent(invite_token)}`;

  return { invite, verifyUrl, token: invite_token };
}

export async function sendReferenceInviteEmail({
  to,
  name,
  applicantData = {},
  verifyUrl,
}) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured. Skipping email.');
    return { skipped: true };
  }

  const html = `
    <h2>You've been asked to provide a professional reference</h2>
    <p>Hi ${name || 'there'},</p>
    <p>${applicantData?.applicantName || 'A professional'} has requested a reference from you${
      applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''
    }.</p>
    <p><strong>Click here to complete the reference:</strong></p>
    <a href="${verifyUrl}" style="background:#0ea5e9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
      Complete Reference
    </a>
    <p>This link will expire soon.</p>
    <p>Best regards,<br/>The HRKey Team</p>
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'HRKey <noreply@hrkey.com>',
      to,
      subject: `Reference Request from ${applicantData?.applicantName || 'HRKey user'}`,
      html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error: ${text}`);
  }

  return { ok: true };
}

// ================================
export async function getInviteByToken(token) {
  const { data, error } = await supabase
    .from('reference_invites')
    .select('*')
    .eq('invite_token', token)
    .single();

  if (error) throw error;
  return data;
}

