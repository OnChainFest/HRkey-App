/**
 * Analytics Layer - Main Entry Point
 *
 * Provides unified access to all analytics services:
 * - Event Tracking
 * - Candidate Metrics
 * - Company Metrics
 * - Conversion Funnels
 * - Demand Trends
 *
 * @module services/analytics
 * @author HRKey Development Team
 * @date 2025-12-10
 */

// Import all analytics services
import * as eventTracker from './eventTracker.js';
import * as candidateMetrics from './candidateMetrics.js';
import * as companyMetrics from './companyMetrics.js';
import * as conversionFunnel from './conversionFunnel.js';
import * as demandTrends from './demandTrends.js';

// Re-export everything for convenience
export { eventTracker, candidateMetrics, companyMetrics, conversionFunnel, demandTrends };

// Export specific functions for direct access
export const {
  logEvent,
  logEventBatch,
  logPageView,
  logCandidateSearch,
  logProfileView,
  logDataAccessRequest,
  EventTypes,
  EventCategories
} = eventTracker;

export const {
  getCandidateActivity,
  getCandidateProfileViews,
  getTopCandidatesByActivity
} = candidateMetrics;

export const {
  getCompanyActivity,
  getCompanySearchBehavior,
  getTopCompaniesByActivity
} = companyMetrics;

export const {
  getConversionFunnel,
  getConversionFunnelForDays,
  getTimeToConversion
} = conversionFunnel;

export const {
  getSkillDemandTrends,
  getTrendingSkills,
  getLocationDemandTrends,
  getMarketDemandSummary
} = demandTrends;

/**
 * Get comprehensive analytics dashboard data.
 *
 * Aggregates data from multiple analytics services for a unified dashboard view.
 *
 * @param {Object} params - Dashboard parameters
 * @param {number} [params.days=30] - Days to look back
 * @returns {Promise<Object>} Dashboard data
 */
export async function getAnalyticsDashboard({ days = 30 } = {}) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Fetch all metrics in parallel
    const [
      topCandidates,
      topCompanies,
      funnel,
      marketDemand
    ] = await Promise.all([
      candidateMetrics.getTopCandidatesByActivity(10, days),
      companyMetrics.getTopCompaniesByActivity(10, days),
      conversionFunnel.getConversionFunnelForDays(days),
      demandTrends.getMarketDemandSummary(days)
    ]);

    return {
      period: {
        days,
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      candidates: {
        top_by_activity: topCandidates
      },
      companies: {
        top_by_activity: topCompanies
      },
      conversion_funnel: funnel,
      market_demand: marketDemand,
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('Analytics: Error generating dashboard', error);
    return null;
  }
}

/**
 * Get analytics layer info and status.
 *
 * @returns {Object} Analytics layer metadata
 */
export function getAnalyticsInfo() {
  return {
    version: '1.0.0',
    services: {
      event_tracker: 'Event logging and tracking',
      candidate_metrics: 'Candidate activity analysis',
      company_metrics: 'Company behavior analysis',
      conversion_funnel: 'User journey and conversion tracking',
      demand_trends: 'Market demand and skill trends'
    },
    event_types: Object.keys(EventTypes),
    event_categories: Object.values(EventCategories),
    features: {
      real_time_tracking: true,
      batch_events: true,
      conversion_funnels: true,
      demand_analysis: true,
      time_series: 'Phase 2'
    }
  };
}

export default {
  // Services
  eventTracker,
  candidateMetrics,
  companyMetrics,
  conversionFunnel,
  demandTrends,

  // Direct exports
  logEvent,
  logEventBatch,
  logPageView,
  logCandidateSearch,
  logProfileView,
  logDataAccessRequest,
  getCandidateActivity,
  getCompanyActivity,
  getConversionFunnel,
  getSkillDemandTrends,
  getTrendingSkills,

  // Dashboard
  getAnalyticsDashboard,
  getAnalyticsInfo,

  // Constants
  EventTypes,
  EventCategories
};
