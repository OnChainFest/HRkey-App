/**
 * Candidate Metrics Service
 *
 * Analyzes candidate-side activity and engagement metrics.
 *
 * @module services/analytics/candidateMetrics
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get candidate activity summary for a time range.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number} [params.limit=50] - Max candidates to return
 * @returns {Promise<Array>} Array of candidate activity summaries
 */
export async function getCandidateActivity({ startDate, endDate, limit = 50 }) {
  try {
    const { data, error } = await supabase
      .rpc('get_candidate_activity_summary', {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        result_limit: limit
      });

    if (error) {
      // If RPC doesn't exist, fall back to direct query
      logger.warn('Analytics: RPC get_candidate_activity_summary not found, using fallback');
      return await getCandidateActivityFallback({ startDate, endDate, limit });
    }

    return data || [];

  } catch (error) {
    logger.error('Analytics: Error in getCandidateActivity', { error: error.message });
    return [];
  }
}

/**
 * Fallback implementation using direct queries.
 *
 * @private
 */
async function getCandidateActivityFallback({ startDate, endDate, limit }) {
  try {
    const { data: events } = await supabase
      .from('analytics_events')
      .select('user_id, event_type, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .not('user_id', 'is', null);

    // Aggregate by user
    const userActivity = {};
    (events || []).forEach(event => {
      if (!userActivity[event.user_id]) {
        userActivity[event.user_id] = {
          user_id: event.user_id,
          total_events: 0,
          unique_event_types: new Set(),
          first_activity: event.created_at,
          last_activity: event.created_at
        };
      }

      const activity = userActivity[event.user_id];
      activity.total_events++;
      activity.unique_event_types.add(event.event_type);
      if (new Date(event.created_at) < new Date(activity.first_activity)) {
        activity.first_activity = event.created_at;
      }
      if (new Date(event.created_at) > new Date(activity.last_activity)) {
        activity.last_activity = event.created_at;
      }
    });

    // Convert to array and format
    const results = Object.values(userActivity).map(activity => ({
      ...activity,
      unique_event_types: activity.unique_event_types.size
    }));

    // Sort by total events descending
    results.sort((a, b) => b.total_events - a.total_events);

    return results.slice(0, limit);

  } catch (error) {
    logger.error('Analytics: Error in getCandidateActivityFallback', { error: error.message });
    return [];
  }
}

/**
 * Get profile views for candidates.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @returns {Promise<Array>} Array of candidates with view counts
 */
export async function getCandidateProfileViews({ startDate, endDate }) {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('context, created_at, company_id')
      .eq('event_type', 'PROFILE_VIEW')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      logger.error('Analytics: Error fetching profile views', { error: error.message });
      return [];
    }

    // Aggregate by candidate
    const viewsByCandidate = {};
    (data || []).forEach(event => {
      const candidateId = event.context?.candidateId;
      if (!candidateId) return;

      if (!viewsByCandidate[candidateId]) {
        viewsByCandidate[candidateId] = {
          candidate_id: candidateId,
          total_views: 0,
          unique_companies: new Set(),
          first_viewed: event.created_at,
          last_viewed: event.created_at
        };
      }

      const views = viewsByCandidate[candidateId];
      views.total_views++;
      if (event.company_id) {
        views.unique_companies.add(event.company_id);
      }
      if (new Date(event.created_at) < new Date(views.first_viewed)) {
        views.first_viewed = event.created_at;
      }
      if (new Date(event.created_at) > new Date(views.last_viewed)) {
        views.last_viewed = event.created_at;
      }
    });

    // Format results
    const results = Object.values(viewsByCandidate).map(views => ({
      ...views,
      unique_companies: views.unique_companies.size
    }));

    // Sort by total views
    results.sort((a, b) => b.total_views - a.total_views);

    return results;

  } catch (error) {
    logger.error('Analytics: Error in getCandidateProfileViews', { error: error.message });
    return [];
  }
}

/**
 * Get top candidates by activity.
 *
 * @param {number} [limit=10] - Number of top candidates
 * @param {number} [days=30] - Days to look back
 * @returns {Promise<Array>} Top candidates
 */
export async function getTopCandidatesByActivity(limit = 10, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getCandidateActivity({ startDate, endDate, limit });
}

export default {
  getCandidateActivity,
  getCandidateProfileViews,
  getTopCandidatesByActivity
};
