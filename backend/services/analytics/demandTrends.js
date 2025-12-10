/**
 * Demand Trends Service
 *
 * Analyzes market demand for skills, roles, and candidate attributes
 * based on search and data access patterns.
 *
 * @module services/analytics/demandTrends
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get skill demand trends from search data.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number} [params.limit=50] - Max skills to return
 * @returns {Promise<Array>} Skill demand data
 */
export async function getSkillDemandTrends({ startDate, endDate, limit = 50 }) {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('context, company_id, created_at')
      .eq('event_type', 'CANDIDATE_SEARCH')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      logger.error('Analytics: Error fetching skill demand', { error: error.message });
      return [];
    }

    // Aggregate skills
    const skillDemand = {};
    (data || []).forEach(event => {
      const skills = event.context?.skills || [];

      skills.forEach(skill => {
        if (!skill) return;

        if (!skillDemand[skill]) {
          skillDemand[skill] = {
            skill: skill,
            search_count: 0,
            unique_companies: new Set(),
            first_searched: event.created_at,
            last_searched: event.created_at,
            trend: 'stable' // Will be calculated
          };
        }

        const demand = skillDemand[skill];
        demand.search_count++;
        if (event.company_id) {
          demand.unique_companies.add(event.company_id);
        }

        // Update timestamps
        if (new Date(event.created_at) < new Date(demand.first_searched)) {
          demand.first_searched = event.created_at;
        }
        if (new Date(event.created_at) > new Date(demand.last_searched)) {
          demand.last_searched = event.created_at;
        }
      });
    });

    // Format results
    const results = Object.values(skillDemand).map(demand => ({
      ...demand,
      unique_companies: demand.unique_companies.size
    }));

    // Sort by search count
    results.sort((a, b) => b.search_count - a.search_count);

    return results.slice(0, limit);

  } catch (error) {
    logger.error('Analytics: Error in getSkillDemandTrends', { error: error.message });
    return [];
  }
}

/**
 * Get trending skills (comparing recent vs previous period).
 *
 * @param {number} [days=7] - Days for recent period
 * @returns {Promise<Object>} Trending skills data
 */
export async function getTrendingSkills(days = 7) {
  try {
    const now = new Date();

    // Recent period
    const recentEnd = now;
    const recentStart = new Date();
    recentStart.setDate(recentStart.getDate() - days);

    // Previous period (same length)
    const previousEnd = new Date(recentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days);

    // Get data for both periods
    const recentData = await getSkillDemandTrends({
      startDate: recentStart,
      endDate: recentEnd,
      limit: 100
    });

    const previousData = await getSkillDemandTrends({
      startDate: previousStart,
      endDate: previousEnd,
      limit: 100
    });

    // Create lookup map for previous period
    const previousMap = {};
    previousData.forEach(skill => {
      previousMap[skill.skill] = skill.search_count;
    });

    // Calculate trend
    const trending = recentData.map(skill => {
      const previousCount = previousMap[skill.skill] || 0;
      const change = skill.search_count - previousCount;
      const percentChange = previousCount > 0
        ? ((change / previousCount) * 100).toFixed(2)
        : (skill.search_count > 0 ? 100 : 0);

      let trendDirection = 'stable';
      if (percentChange > 20) trendDirection = 'rising';
      else if (percentChange < -20) trendDirection = 'falling';

      return {
        skill: skill.skill,
        recent_searches: skill.search_count,
        previous_searches: previousCount,
        change: change,
        percent_change: Number(percentChange),
        trend: trendDirection,
        unique_companies: skill.unique_companies
      };
    });

    // Sort by percent change (descending)
    trending.sort((a, b) => b.percent_change - a.percent_change);

    return {
      period_days: days,
      recent_period: {
        start: recentStart.toISOString(),
        end: recentEnd.toISOString()
      },
      previous_period: {
        start: previousStart.toISOString(),
        end: previousEnd.toISOString()
      },
      trending_skills: trending.slice(0, 20) // Top 20
    };

  } catch (error) {
    logger.error('Analytics: Error in getTrendingSkills', { error: error.message });
    return null;
  }
}

/**
 * Get location demand trends.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @returns {Promise<Array>} Location demand data
 */
export async function getLocationDemandTrends({ startDate, endDate }) {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('context, company_id, created_at')
      .eq('event_type', 'CANDIDATE_SEARCH')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      logger.error('Analytics: Error fetching location demand', { error: error.message });
      return [];
    }

    // Aggregate locations
    const locationDemand = {};
    (data || []).forEach(event => {
      const location = event.context?.location;
      if (!location) return;

      if (!locationDemand[location]) {
        locationDemand[location] = {
          location: location,
          search_count: 0,
          unique_companies: new Set()
        };
      }

      locationDemand[location].search_count++;
      if (event.company_id) {
        locationDemand[location].unique_companies.add(event.company_id);
      }
    });

    // Format results
    const results = Object.values(locationDemand).map(demand => ({
      ...demand,
      unique_companies: demand.unique_companies.size
    }));

    // Sort by search count
    results.sort((a, b) => b.search_count - a.search_count);

    return results;

  } catch (error) {
    logger.error('Analytics: Error in getLocationDemandTrends', { error: error.message });
    return [];
  }
}

/**
 * Get overall market demand summary.
 *
 * @param {number} [days=30] - Days to look back
 * @returns {Promise<Object>} Market demand summary
 */
export async function getMarketDemandSummary(days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const [skills, locations, trending] = await Promise.all([
      getSkillDemandTrends({ startDate, endDate, limit: 10 }),
      getLocationDemandTrends({ startDate, endDate }),
      getTrendingSkills(7)
    ]);

    return {
      period_days: days,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      top_skills: skills.slice(0, 10),
      top_locations: locations.slice(0, 10),
      trending_skills: trending?.trending_skills?.slice(0, 10) || []
    };

  } catch (error) {
    logger.error('Analytics: Error in getMarketDemandSummary', { error: error.message });
    return null;
  }
}

export default {
  getSkillDemandTrends,
  getTrendingSkills,
  getLocationDemandTrends,
  getMarketDemandSummary
};
