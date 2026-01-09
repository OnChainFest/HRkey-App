/**
 * Dashboard Overview Service
 *
 * Provides aggregated data for the unified Person Dashboard
 * Supports dual modes: Candidate and Referrer
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Get user profile information
 */
async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, wallet_address, identity_verified, created_at')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      email: data.email,
      name: data.full_name || data.email?.split('@')[0] || 'User',
      handle: data.email?.split('@')[0] || 'user',
      walletAddress: data.wallet_address,
      identityVerified: data.identity_verified || false,
      createdAt: data.created_at
    };
  } catch (error) {
    logger.warn('Failed to fetch user profile', { userId, error: error.message });
    return {
      id: userId,
      email: null,
      name: 'User',
      handle: 'user',
      walletAddress: null,
      identityVerified: false,
      createdAt: null
    };
  }
}

/**
 * Get user's enabled roles
 */
async function getUserRoles(userId) {
  try {
    const { data, error } = await supabase
      .from('profile_roles')
      .select('role, is_enabled')
      .eq('user_id', userId)
      .eq('is_enabled', true);

    if (error) {
      // If profile_roles table doesn't exist yet, return default
      if (error.code === '42P01') {
        logger.info('profile_roles table not found, returning default roles', { userId });
        return {
          candidateEnabled: true,
          referrerEnabled: true
        };
      }
      throw error;
    }

    const roles = data || [];
    return {
      candidateEnabled: roles.some(r => r.role === 'candidate'),
      referrerEnabled: roles.some(r => r.role === 'referrer')
    };
  } catch (error) {
    logger.warn('Failed to fetch user roles', { userId, error: error.message });
    // Default: both roles enabled
    return {
      candidateEnabled: true,
      referrerEnabled: true
    };
  }
}

/**
 * Get global summary (rewards, notifications)
 */
async function getGlobalSummary(userId) {
  try {
    // Fetch user balance from user_balance_ledger
    const { data: balanceData, error: balanceError } = await supabase
      .from('user_balance_ledger')
      .select('amount')
      .eq('user_id', userId);

    let rewardsBalance = 0;
    if (!balanceError && balanceData) {
      rewardsBalance = balanceData.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0);
    }

    // Count unread notifications (if notifications table exists)
    // For now, return 0 as safe fallback
    const notificationsCount = 0;

    return {
      rewardsBalance: parseFloat(rewardsBalance.toFixed(2)),
      notificationsCount
    };
  } catch (error) {
    logger.warn('Failed to fetch global summary', { userId, error: error.message });
    return {
      rewardsBalance: 0,
      notificationsCount: 0
    };
  }
}

/**
 * Get candidate mode summary
 * Data about user's own profile, references, data access requests
 */
async function getCandidateSummary(userId) {
  try {
    // Count pending reference invites (user requested references)
    const { data: pendingInvites, error: invitesError } = await supabase
      .from('reference_invites')
      .select('id, referee_name, referee_email, created_at, status')
      .eq('requester_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    const pendingReferenceRequestsCount = pendingInvites?.length || 0;

    // Count completed references (references submitted for user)
    const { count: completedCount, error: completedError } = await supabase
      .from('references')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'active');

    const completedReferencesCount = completedCount || 0;

    // Count data access requests about this user
    const { count: dataAccessCount, error: dataAccessError } = await supabase
      .from('data_access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('target_user_id', userId);

    const dataAccessRequestsCount = dataAccessCount || 0;

    // Get recent items for display
    const recentItems = [];

    // Add pending invites as recent items
    if (pendingInvites && pendingInvites.length > 0) {
      pendingInvites.forEach(invite => {
        recentItems.push({
          type: 'pending_invite',
          title: `Reference request to ${invite.referee_name || invite.referee_email}`,
          description: 'Waiting for response',
          timestamp: invite.created_at,
          status: 'pending'
        });
      });
    }

    // Get recent completed references
    if (completedReferencesCount > 0) {
      const { data: recentRefs, error: recentRefsError } = await supabase
        .from('references')
        .select('id, referrer_name, created_at, overall_rating')
        .eq('owner_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3);

      if (!recentRefsError && recentRefs) {
        recentRefs.forEach(ref => {
          recentItems.push({
            type: 'reference_received',
            title: `Reference from ${ref.referrer_name}`,
            description: `Rating: ${ref.overall_rating || 'N/A'}`,
            timestamp: ref.created_at,
            status: 'completed'
          });
        });
      }
    }

    // Sort recent items by timestamp
    recentItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      pendingReferenceRequestsCount,
      completedReferencesCount,
      dataAccessRequestsCount,
      recentItems: recentItems.slice(0, 5) // Limit to 5 most recent
    };
  } catch (error) {
    logger.warn('Failed to fetch candidate summary', { userId, error: error.message });
    return {
      pendingReferenceRequestsCount: 0,
      completedReferencesCount: 0,
      dataAccessRequestsCount: 0,
      recentItems: []
    };
  }
}

/**
 * Get referrer mode summary
 * Data about references user has been asked to provide
 */
async function getReferrerSummary(userId) {
  try {
    // Count assigned reference invites (user is the referee)
    const { data: assignedInvites, error: assignedError } = await supabase
      .from('reference_invites')
      .select('id, requester_id, metadata, created_at, status')
      .eq('referee_email', async () => {
        // Get user's email
        const { data: userData } = await supabase
          .from('users')
          .select('email')
          .eq('id', userId)
          .single();
        return userData?.email;
      });

    // Alternative approach: query by email directly
    const { data: userData } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = userData?.email;

    let assignedRequestsCount = 0;
    let completedAsReferrerCount = 0;
    let recentItems = [];

    if (userEmail) {
      // Count pending invites where user is the referee
      const { data: pending, error: pendingError } = await supabase
        .from('reference_invites')
        .select('id, requester_id, metadata, created_at')
        .eq('referee_email', userEmail)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      assignedRequestsCount = pending?.length || 0;

      // Add to recent items
      if (pending && pending.length > 0) {
        pending.forEach(invite => {
          const candidateName = invite.metadata?.candidateName || 'Unknown candidate';
          recentItems.push({
            type: 'reference_request_assigned',
            title: `Reference request for ${candidateName}`,
            description: 'Waiting for your response',
            timestamp: invite.created_at,
            status: 'pending'
          });
        });
      }

      // Count completed references (where user is the referrer)
      const { count: completedCount, error: completedError } = await supabase
        .from('references')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_email', userEmail)
        .eq('status', 'active');

      completedAsReferrerCount = completedCount || 0;

      // Get recent completed references
      if (completedAsReferrerCount > 0) {
        const { data: completed, error: completedRefsError } = await supabase
          .from('references')
          .select('id, owner_id, created_at')
          .eq('referrer_email', userEmail)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(3);

        if (!completedRefsError && completed) {
          completed.forEach(ref => {
            recentItems.push({
              type: 'reference_submitted',
              title: 'Reference submitted',
              description: 'Successfully submitted',
              timestamp: ref.created_at,
              status: 'completed'
            });
          });
        }
      }
    }

    // Calculate rewards earned (from revenue_shares if available)
    let rewardsEarned = 0;
    try {
      const { data: revenueData, error: revenueError } = await supabase
        .from('revenue_shares')
        .select('referrer_amount')
        .eq('referrer_id', userId);

      if (!revenueError && revenueData) {
        rewardsEarned = revenueData.reduce((sum, entry) => sum + parseFloat(entry.referrer_amount || 0), 0);
      }
    } catch (err) {
      // revenue_shares might not have referrer_id field, safe to ignore
      logger.debug('Could not fetch referrer rewards', { error: err.message });
    }

    // Sort recent items by timestamp
    recentItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      assignedRequestsCount,
      completedAsReferrerCount,
      rewardsEarned: parseFloat(rewardsEarned.toFixed(2)),
      recentItems: recentItems.slice(0, 5)
    };
  } catch (error) {
    logger.warn('Failed to fetch referrer summary', { userId, error: error.message });
    return {
      assignedRequestsCount: 0,
      completedAsReferrerCount: 0,
      rewardsEarned: 0,
      recentItems: []
    };
  }
}

/**
 * Main function: Get complete dashboard overview for a user
 */
export async function getDashboardOverview(userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  logger.info('Fetching dashboard overview', { userId });

  // Fetch all sections in parallel
  const [userProfile, roles, globalSummary, candidateSummary, referrerSummary] = await Promise.all([
    getUserProfile(userId),
    getUserRoles(userId),
    getGlobalSummary(userId),
    getCandidateSummary(userId),
    getReferrerSummary(userId)
  ]);

  const overview = {
    userProfile,
    roles,
    globalSummary,
    candidateSummary,
    referrerSummary
  };

  logger.info('Dashboard overview fetched successfully', {
    userId,
    candidateEnabled: roles.candidateEnabled,
    referrerEnabled: roles.referrerEnabled
  });

  return overview;
}
