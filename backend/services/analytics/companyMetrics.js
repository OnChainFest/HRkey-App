/**
 * Company Metrics Service
 *
 * Analyzes company behavior, search patterns, and engagement.
 *
 * @module services/analytics/companyMetrics
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get company activity summary.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number} [params.limit=50] - Max companies to return
 * @returns {Promise<Array>} Array of company activity summaries
 */
export async function getCompanyActivity({ startDate, endDate, limit = 50 }) {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('company_id, event_type, user_id, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .not('company_id', 'is', null);

    if (error) {
      logger.error('Analytics: Error fetching company activity', { error: error.message });
      return [];
    }

    // Aggregate by company
    const companyActivity = {};
    (data || []).forEach(event => {
      if (!companyActivity[event.company_id]) {
        companyActivity[event.company_id] = {
          company_id: event.company_id,
          total_events: 0,
          unique_users: new Set(),
          unique_event_types: new Set(),
          data_requests: 0,
          profile_views: 0,
          searches: 0,
          first_activity: event.created_at,
          last_activity: event.created_at
        };
      }

      const activity = companyActivity[event.company_id];
      activity.total_events++;
      if (event.user_id) {
        activity.unique_users.add(event.user_id);
      }
      activity.unique_event_types.add(event.event_type);

      // Count specific event types
      if (event.event_type === 'DATA_ACCESS_REQUEST') activity.data_requests++;
      if (event.event_type === 'PROFILE_VIEW') activity.profile_views++;
      if (event.event_type === 'CANDIDATE_SEARCH') activity.searches++;

      // Update timestamps
      if (new Date(event.created_at) < new Date(activity.first_activity)) {
        activity.first_activity = event.created_at;
      }
      if (new Date(event.created_at) > new Date(activity.last_activity)) {
        activity.last_activity = event.created_at;
      }
    });

    // Format results
    const results = Object.values(companyActivity).map(activity => ({
      ...activity,
      unique_users: activity.unique_users.size,
      unique_event_types: activity.unique_event_types.size
    }));

    // Sort by total events
    results.sort((a, b) => b.total_events - a.total_events);

    return results.slice(0, limit);

  } catch (error) {
    logger.error('Analytics: Error in getCompanyActivity', { error: error.message });
    return [];
  }
}

/**
 * Get company search behavior (what skills/attributes they search for).
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.companyId] - Specific company (optional)
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @returns {Promise<Array>} Search behavior data
 */
export async function getCompanySearchBehavior({ companyId = null, startDate, endDate }) {
  try {
    let query = supabase
      .from('analytics_events')
      .select('company_id, context, created_at')
      .eq('event_type', 'CANDIDATE_SEARCH')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Analytics: Error fetching search behavior', { error: error.message });
      return [];
    }

    // Aggregate search terms
    const searchTerms = {};
    (data || []).forEach(event => {
      const context = event.context || {};
      const skills = context.skills || [];
      const location = context.location;

      // Track skills
      skills.forEach(skill => {
        if (!searchTerms[skill]) {
          searchTerms[skill] = {
            term: skill,
            type: 'skill',
            count: 0,
            companies: new Set()
          };
        }
        searchTerms[skill].count++;
        if (event.company_id) {
          searchTerms[skill].companies.add(event.company_id);
        }
      });

      // Track locations
      if (location) {
        const key = `location:${location}`;
        if (!searchTerms[key]) {
          searchTerms[key] = {
            term: location,
            type: 'location',
            count: 0,
            companies: new Set()
          };
        }
        searchTerms[key].count++;
        if (event.company_id) {
          searchTerms[key].companies.add(event.company_id);
        }
      }
    });

    // Format results
    const results = Object.values(searchTerms).map(term => ({
      ...term,
      unique_companies: term.companies.size
    }));

    // Sort by count
    results.sort((a, b) => b.count - a.count);

    return results;

  } catch (error) {
    logger.error('Analytics: Error in getCompanySearchBehavior', { error: error.message });
    return [];
  }
}

/**
 * Get top companies by activity.
 *
 * @param {number} [limit=10] - Number of top companies
 * @param {number} [days=30] - Days to look back
 * @returns {Promise<Array>} Top companies
 */
export async function getTopCompaniesByActivity(limit = 10, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getCompanyActivity({ startDate, endDate, limit });
}

export default {
  getCompanyActivity,
  getCompanySearchBehavior,
  getTopCompaniesByActivity
};
