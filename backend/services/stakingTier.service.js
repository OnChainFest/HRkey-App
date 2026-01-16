import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const TIER_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum'];
const DEFAULT_TIER_REQUIREMENTS = {
  reference: process.env.DATA_ACCESS_TIER_REFERENCE || 'bronze',
  profile: process.env.DATA_ACCESS_TIER_PROFILE || 'silver',
  full_data: process.env.DATA_ACCESS_TIER_FULL_DATA || 'gold'
};
const DEFAULT_STAKE_CACHE_HOURS = Number(process.env.STAKE_CACHE_MAX_AGE_HOURS || 24);

export function getRequiredTierForDataType(dataType) {
  return DEFAULT_TIER_REQUIREMENTS[dataType] || DEFAULT_TIER_REQUIREMENTS.reference;
}

export function hasRequiredTier(actualTier, requiredTier) {
  const actualIndex = TIER_ORDER.indexOf((actualTier || 'none').toLowerCase());
  const requiredIndex = TIER_ORDER.indexOf((requiredTier || 'none').toLowerCase());

  if (actualIndex === -1 || requiredIndex === -1) {
    return false;
  }

  return actualIndex >= requiredIndex;
}

export async function getStakeTierStatus({ userId, walletAddress }) {
  if (!userId && !walletAddress) return null;

  let query = supabase
    .from('staking_tiers')
    .select('user_id, wallet_address, tier, stake_amount, updated_at');

  if (userId && walletAddress) {
    query = query.or(`user_id.eq.${userId},wallet_address.eq.${walletAddress}`);
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('wallet_address', walletAddress);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  if (updatedAt) {
    const ageHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > DEFAULT_STAKE_CACHE_HOURS) {
      return null;
    }
  }

  return {
    userId: data.user_id || null,
    walletAddress: data.wallet_address || null,
    tier: data.tier || 'none',
    stakeAmount: data.stake_amount || 0,
    updatedAt: data.updated_at || null
  };
}

export default {
  getRequiredTierForDataType,
  hasRequiredTier,
  getStakeTierStatus
};
