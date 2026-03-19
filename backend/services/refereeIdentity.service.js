import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'test-service-role-key';

let supabaseClient;

export const REFEREE_RESOLUTION_STRATEGIES = Object.freeze({
  EMAIL: 'email',
  SIGNER: 'signer',
  FALLBACK: 'fallback'
});

function getSupabaseClient() {
  if (process.env.NODE_ENV === 'test' && supabaseClient) {
    return supabaseClient;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  return supabaseClient;
}

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}

export function normalizeIdentityPart(value) {
  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._\-\s]+/g, '')
    .replace(/\s+/g, ' ');

  return normalized || null;
}

function hashIdentityKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildRefereeId(strategy, canonicalKey) {
  return `referee_${strategy}_${hashIdentityKey(canonicalKey)}`;
}

async function fetchSignerIdentity(reference) {
  const normalizedEmail = normalizeIdentityPart(reference?.referrer_email);
  const client = getSupabaseClient();

  const signerLookup = async (builder) => {
    const { data, error } = await builder.maybeSingle();
    if (error) {
      logger.warn('Failed to lookup company signer for referee identity resolution', {
        referenceId: reference?.id,
        ownerId: reference?.owner_id,
        error: error.message
      });
      return null;
    }

    return data || null;
  };

  if (reference?.invite_id) {
    const byInvite = await signerLookup(
      client
        .from('reference_invites')
        .select('company_signer_id, company_id')
        .eq('id', reference.invite_id)
    );

    if (byInvite?.company_signer_id) {
      const signer = await signerLookup(
        client
          .from('company_signers')
          .select('id, user_id, company_id, email, role, is_active')
          .eq('id', byInvite.company_signer_id)
      );

      if (signer) {
        return signer;
      }
    }
  }

  if (normalizedEmail && reference?.referrer_company) {
    const signer = await signerLookup(
      client
        .from('company_signers')
        .select('id, user_id, company_id, email, role, is_active')
        .eq('email', normalizedEmail)
        .eq('is_active', true)
    );

    if (signer) {
      return signer;
    }
  }

  return null;
}

export async function resolveRefereeIdentity(reference) {
  if (!reference || typeof reference !== 'object') {
    throw new Error('Reference record is required to resolve referee identity');
  }

  const normalizedEmail = normalizeIdentityPart(reference.referrer_email);
  const normalizedName = normalizeIdentityPart(reference.referrer_name);
  const normalizedCompany = normalizeIdentityPart(reference.referrer_company);

  if (normalizedEmail) {
    const canonicalKey = `email:${normalizedEmail}`;
    return {
      refereeId: buildRefereeId(REFEREE_RESOLUTION_STRATEGIES.EMAIL, canonicalKey),
      entityType: 'referee',
      resolutionStrategy: REFEREE_RESOLUTION_STRATEGIES.EMAIL,
      canonicalKey,
      confidence: 'high',
      normalizedAttributes: {
        email: normalizedEmail,
        name: normalizedName,
        company: normalizedCompany,
        role: null
      },
      signerId: null,
      signerUserId: null
    };
  }

  const signer = await fetchSignerIdentity(reference);
  if (signer?.id) {
    const normalizedSignerEmail = normalizeIdentityPart(signer.email);
    const normalizedSignerRole = normalizeIdentityPart(signer.role);
    const canonicalKey = `signer:${signer.id}`;

    return {
      refereeId: buildRefereeId(REFEREE_RESOLUTION_STRATEGIES.SIGNER, canonicalKey),
      entityType: 'referee',
      resolutionStrategy: REFEREE_RESOLUTION_STRATEGIES.SIGNER,
      canonicalKey,
      confidence: 'high',
      normalizedAttributes: {
        email: normalizedSignerEmail,
        name: normalizedName,
        company: normalizeIdentityPart(signer.company_id || reference.referrer_company),
        role: normalizedSignerRole
      },
      signerId: signer.id,
      signerUserId: signer.user_id || null
    };
  }

  const normalizedRole = normalizeIdentityPart(reference.referrer_role || reference.role_id);
  const fallbackKeyParts = [
    `name:${normalizedName || 'unknown'}`,
    `company:${normalizedCompany || 'unknown'}`,
    `role:${normalizedRole || 'unknown'}`
  ];
  const canonicalKey = `fallback:${fallbackKeyParts.join('|')}`;

  return {
    refereeId: buildRefereeId(REFEREE_RESOLUTION_STRATEGIES.FALLBACK, canonicalKey),
    entityType: 'referee',
    resolutionStrategy: REFEREE_RESOLUTION_STRATEGIES.FALLBACK,
    canonicalKey,
    confidence: normalizedName && normalizedCompany ? 'medium' : 'low',
    normalizedAttributes: {
      email: null,
      name: normalizedName,
      company: normalizedCompany,
      role: normalizedRole
    },
    signerId: null,
    signerUserId: null
  };
}

export async function ensureCanonicalRefereeIdentity(reference) {
  const resolvedIdentity = await resolveRefereeIdentity(reference);
  const client = getSupabaseClient();
  const timestamp = new Date().toISOString();

  const record = {
    id: resolvedIdentity.refereeId,
    resolution_strategy: resolvedIdentity.resolutionStrategy,
    canonical_key_hash: hashIdentityKey(resolvedIdentity.canonicalKey),
    normalized_email: resolvedIdentity.normalizedAttributes.email,
    normalized_name: resolvedIdentity.normalizedAttributes.name,
    normalized_company: resolvedIdentity.normalizedAttributes.company,
    normalized_role: resolvedIdentity.normalizedAttributes.role,
    signer_id: resolvedIdentity.signerId,
    signer_user_id: resolvedIdentity.signerUserId,
    confidence: resolvedIdentity.confidence,
    metadata: {
      canonical_key_preview: resolvedIdentity.canonicalKey.slice(0, 96),
      source_reference_id: reference.id || null
    },
    updated_at: timestamp
  };

  const { data, error } = await client
    .from('referee_identities')
    .upsert(record, {
      onConflict: 'id',
      ignoreDuplicates: false
    })
    .select('*')
    .single();

  if (error || !data) {
    logger.error('Failed to persist canonical referee identity', {
      referenceId: reference?.id,
      ownerId: reference?.owner_id,
      refereeId: resolvedIdentity.refereeId,
      error: error?.message
    });
    throw new Error('Failed to persist canonical referee identity');
  }

  return {
    ...resolvedIdentity,
    persistedIdentity: data,
    auditMetadata: {
      resolution_strategy: resolvedIdentity.resolutionStrategy,
      confidence: resolvedIdentity.confidence,
      canonical_key_hash: data.canonical_key_hash,
      signer_id: resolvedIdentity.signerId,
      signer_user_id: resolvedIdentity.signerUserId,
      normalized_attributes: resolvedIdentity.normalizedAttributes,
      resolved_at: timestamp
    }
  };
}
