/**
 * Public Profile Resolver
 *
 * Core profile resolution logic for public candidate profiles.
 * Handles resolution by identifier (handle or user ID) with fail-soft behavior.
 *
 * @module services/publicProfile/resolver
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Normalize skills field from various formats to string array.
 *
 * @param {any} raw - Raw skills value (array, string, or other)
 * @returns {string[]|null} Normalized skills array or null
 */
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
 * @typedef {Object} BaseProfile
 * @property {string} userId - User ID
 * @property {string|null} handle - Public handle
 * @property {string|null} fullName - Full name
 * @property {string|null} headline - Professional headline
 * @property {string[]|null} skills - List of skills
 * @property {boolean} isPublicProfile - Whether profile is public
 */

/**
 * Resolve a public candidate profile by identifier (handle or user ID).
 *
 * This function:
 * - Accepts handle or user ID as identifier
 * - Queries the users table with fail-soft error handling
 * - Respects is_public_profile flag
 * - Returns null for non-public or missing profiles
 * - Never throws errors to callers
 *
 * @param {string} identifier - Handle or user ID
 * @returns {Promise<BaseProfile|null>} Profile or null
 *
 * @example
 * const profile = await resolveProfileByIdentifier('john_doe');
 * if (profile) {
 *   console.log(`Found profile for ${profile.fullName}`);
 * }
 */
export async function resolveProfileByIdentifier(identifier) {
  try {
    const normalizedIdentifier = identifier?.trim();
    if (!normalizedIdentifier) {
      logger.debug('PublicProfile: Empty identifier provided');
      return null;
    }

    // Query by handle or user ID
    const { data: profileRow, error } = await supabase
      .from('users')
      .select('id, public_handle, full_name, name, headline, title, skills, is_public_profile')
      .or(`id.eq.${normalizedIdentifier},public_handle.eq.${normalizedIdentifier}`)
      .maybeSingle();

    if (error) {
      logger.error('PublicProfile: Database error in resolveProfileByIdentifier', {
        identifier: normalizedIdentifier,
        error: error.message
      });
      return null;
    }

    if (!profileRow) {
      logger.debug('PublicProfile: Profile not found', {
        identifier: normalizedIdentifier
      });
      return null;
    }

    // Respect privacy flag
    if (profileRow.is_public_profile === false) {
      logger.debug('PublicProfile: Profile is not public', {
        identifier: normalizedIdentifier,
        userId: profileRow.id
      });
      return null;
    }

    // Build safe profile object
    const profile = {
      userId: profileRow.id,
      handle: profileRow.public_handle || null,
      fullName: profileRow.full_name || profileRow.name || null,
      headline: profileRow.headline || profileRow.title || null,
      skills: normalizeSkills(profileRow.skills),
      isPublicProfile: profileRow.is_public_profile !== false
    };

    logger.debug('PublicProfile: Profile resolved successfully', {
      userId: profile.userId,
      handle: profile.handle
    });

    return profile;

  } catch (err) {
    // Fail-soft: never throw to caller
    logger.error('PublicProfile: Exception in resolveProfileByIdentifier', {
      identifier,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

/**
 * Resolve a profile by user ID only.
 *
 * Similar to resolveProfileByIdentifier but specifically for user IDs.
 * Useful when you already have a userId and want to fetch the profile.
 *
 * @param {string} userId - User ID
 * @returns {Promise<BaseProfile|null>} Profile or null
 *
 * @example
 * const profile = await resolveProfileByUserId('uuid-123');
 */
export async function resolveProfileByUserId(userId) {
  try {
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) {
      logger.debug('PublicProfile: Empty userId provided');
      return null;
    }

    const { data: profileRow, error } = await supabase
      .from('users')
      .select('id, public_handle, full_name, name, headline, title, skills, is_public_profile')
      .eq('id', normalizedUserId)
      .maybeSingle();

    if (error) {
      logger.error('PublicProfile: Database error in resolveProfileByUserId', {
        userId: normalizedUserId,
        error: error.message
      });
      return null;
    }

    if (!profileRow) {
      logger.debug('PublicProfile: User not found', {
        userId: normalizedUserId
      });
      return null;
    }

    // Respect privacy flag
    if (profileRow.is_public_profile === false) {
      logger.debug('PublicProfile: User profile is not public', {
        userId: normalizedUserId
      });
      return null;
    }

    const profile = {
      userId: profileRow.id,
      handle: profileRow.public_handle || null,
      fullName: profileRow.full_name || profileRow.name || null,
      headline: profileRow.headline || profileRow.title || null,
      skills: normalizeSkills(profileRow.skills),
      isPublicProfile: profileRow.is_public_profile !== false
    };

    logger.debug('PublicProfile: User profile resolved successfully', {
      userId: profile.userId
    });

    return profile;

  } catch (err) {
    logger.error('PublicProfile: Exception in resolveProfileByUserId', {
      userId,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

/**
 * Get the preferred public identifier for a user (handle or fallback to ID).
 *
 * @param {string} userId - User ID
 * @returns {Promise<{userId: string, identifier: string, handle: string|null, isPublicProfile: boolean}|null>}
 *
 * @example
 * const ident = await getPublicIdentifierForUser('uuid-123');
 * // Returns: { userId: 'uuid-123', identifier: 'john_doe', handle: 'john_doe', isPublicProfile: true }
 */
export async function getPublicIdentifierForUser(userId) {
  try {
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) {
      logger.debug('PublicProfile: Empty userId provided for identifier lookup');
      return null;
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, public_handle, is_public_profile')
      .eq('id', normalizedUserId)
      .maybeSingle();

    if (error) {
      logger.error('PublicProfile: Database error in getPublicIdentifierForUser', {
        userId: normalizedUserId,
        error: error.message
      });
      return null;
    }

    if (!data) {
      logger.debug('PublicProfile: User not found for identifier lookup', {
        userId: normalizedUserId
      });
      return null;
    }

    const handle = data.public_handle || null;
    const identifier = handle || data.id;
    const isPublicProfile = data.is_public_profile !== false;

    return {
      userId: data.id,
      identifier,
      handle,
      isPublicProfile
    };

  } catch (err) {
    logger.error('PublicProfile: Exception in getPublicIdentifierForUser', {
      userId,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

export default {
  resolveProfileByIdentifier,
  resolveProfileByUserId,
  getPublicIdentifierForUser
};
