/**
 * Public Profile Service
 * Fetches a candidate profile and attaches evaluation/tokenomics previews for public display.
 */

import { createClient } from '@supabase/supabase-js';
import { evaluateCandidateForUser } from './candidateEvaluation.service.js';
import { getTokenomicsPreviewForUser } from './tokenomicsPreview.service.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

function normalizeSkills(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value)).filter((value) => value.trim());
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return null;
}

/**
 * @typedef {Object} PublicProfile
 * @property {string} userId
 * @property {string|null} handle
 * @property {string|null} fullName
 * @property {string|null} headline
 * @property {string[]|null} skills
 * @property {number} hrScore
 * @property {number} priceUsd
 * @property {number|null} hrkTokens
 */

/**
 * Resolve a public candidate profile by handle or user id.
 * @param {string} identifier
 * @returns {Promise<PublicProfile|null>}
 */
export async function getPublicProfile(identifier) {
  const normalizedIdentifier = identifier?.trim();
  if (!normalizedIdentifier) return null;

  const { data: profileRow, error } = await supabaseClient
    .from('users')
    .select('*')
    .or(`id.eq.${normalizedIdentifier},public_handle.eq.${normalizedIdentifier}`)
    .maybeSingle();

  if (error) throw error;
  if (!profileRow) return null;
  if (profileRow.is_public_profile === false) return null;

  const userId = profileRow.id;
  const handle = profileRow.public_handle || null;
  const fullName = profileRow.full_name || profileRow.name || null;
  const headline = profileRow.headline || profileRow.title || null;
  const skills = normalizeSkills(profileRow.skills);

  const evaluation = await evaluateCandidateForUser(userId);
  const hrScore = evaluation?.scoring?.hrScoreResult?.hrScore ?? 0;
  const priceUsd = evaluation?.scoring?.pricingResult?.priceUsd ?? 0;

  let hrkTokens = null;
  try {
    const preview = await getTokenomicsPreviewForUser(userId);
    hrkTokens = preview?.tokens?.clampedTokens ?? null;
  } catch (err) {
    hrkTokens = null; // Tokenomics preview is optional for public display
  }

  return {
    userId,
    handle,
    fullName,
    headline,
    skills,
    hrScore,
    priceUsd,
    hrkTokens
  };
}

/**
 * Resolve the preferred public identifier (handle -> id fallback) for a user.
 * Returns null when the user record is missing.
 * @param {string} userId
 * @returns {Promise<{ userId: string, identifier: string, handle: string|null, isPublicProfile: boolean }|null>}
 */
export async function getPublicIdentifierForUser(userId) {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return null;

  const { data, error } = await supabaseClient
    .from('users')
    .select('id, public_handle, is_public_profile')
    .eq('id', normalizedUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const handle = data.public_handle || null;
  const identifier = handle || data.id;
  const isPublicProfile = data.is_public_profile !== false;

  return {
    userId: data.id,
    identifier,
    handle,
    isPublicProfile
  };
}

export default {
  getPublicProfile,
  getPublicIdentifierForUser
};
