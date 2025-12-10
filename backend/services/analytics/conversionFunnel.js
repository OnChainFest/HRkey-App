/**
 * Conversion Funnel Service
 *
 * Tracks user journey through key conversion stages:
 * Signup → Company Creation → Data Request → Approval → Payment
 *
 * @module services/analytics/conversionFunnel
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get conversion funnel metrics for a time range.
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @returns {Promise<Object>} Funnel metrics
 */
export async function getConversionFunnel({ startDate, endDate }) {
  try {
    // Query all relevant events
    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_type, user_id, company_id, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .in('event_type', [
        'USER_SIGNUP',
        'COMPANY_CREATED',
        'DATA_ACCESS_REQUEST',
        'DATA_ACCESS_APPROVED',
        'PAYMENT_COMPLETED'
      ]);

    if (error) {
      logger.error('Analytics: Error fetching funnel events', { error: error.message });
      return null;
    }

    // Calculate funnel stages
    const signups = new Set();
    const companiesCreated = new Set();
    const dataRequests = new Set();
    const approvals = new Set();
    const payments = new Set();

    (events || []).forEach(event => {
      const key = event.user_id || event.company_id;
      if (!key) return;

      switch (event.event_type) {
        case 'USER_SIGNUP':
          signups.add(key);
          break;
        case 'COMPANY_CREATED':
          companiesCreated.add(key);
          break;
        case 'DATA_ACCESS_REQUEST':
          dataRequests.add(key);
          break;
        case 'DATA_ACCESS_APPROVED':
          approvals.add(key);
          break;
        case 'PAYMENT_COMPLETED':
          payments.add(key);
          break;
      }
    });

    // Calculate conversion rates
    const signupCount = signups.size;
    const companyCreatedCount = companiesCreated.size;
    const dataRequestCount = dataRequests.size;
    const approvalCount = approvals.size;
    const paymentCount = payments.size;

    return {
      stages: [
        {
          name: 'Signups',
          count: signupCount,
          percentage: 100,
          dropoff: 0
        },
        {
          name: 'Companies Created',
          count: companyCreatedCount,
          percentage: signupCount > 0 ? (companyCreatedCount / signupCount * 100).toFixed(2) : 0,
          dropoff: signupCount - companyCreatedCount
        },
        {
          name: 'Data Requests',
          count: dataRequestCount,
          percentage: companyCreatedCount > 0 ? (dataRequestCount / companyCreatedCount * 100).toFixed(2) : 0,
          dropoff: companyCreatedCount - dataRequestCount
        },
        {
          name: 'Requests Approved',
          count: approvalCount,
          percentage: dataRequestCount > 0 ? (approvalCount / dataRequestCount * 100).toFixed(2) : 0,
          dropoff: dataRequestCount - approvalCount
        },
        {
          name: 'Payments Completed',
          count: paymentCount,
          percentage: approvalCount > 0 ? (paymentCount / approvalCount * 100).toFixed(2) : 0,
          dropoff: approvalCount - paymentCount
        }
      ],
      overall_conversion: signupCount > 0 ? (paymentCount / signupCount * 100).toFixed(2) : 0,
      total_signups: signupCount,
      total_payments: paymentCount,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };

  } catch (error) {
    logger.error('Analytics: Error in getConversionFunnel', { error: error.message });
    return null;
  }
}

/**
 * Get funnel for last N days.
 *
 * @param {number} [days=30] - Number of days to look back
 * @returns {Promise<Object>} Funnel metrics
 */
export async function getConversionFunnelForDays(days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getConversionFunnel({ startDate, endDate });
}

/**
 * Get time-to-conversion metrics (how long each stage takes).
 *
 * @param {Object} params - Query parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @returns {Promise<Object>} Time-to-conversion metrics
 */
export async function getTimeToConversion({ startDate, endDate }) {
  try {
    // This is a simplified version
    // For full implementation, would need to track individual user journeys
    // and calculate time between stages

    logger.info('Analytics: Time-to-conversion analysis is a TODO for Phase 2');

    return {
      message: 'Time-to-conversion analysis coming in Phase 2',
      average_days_to_payment: null,
      median_days_to_payment: null,
      fastest_conversion: null,
      slowest_conversion: null
    };

  } catch (error) {
    logger.error('Analytics: Error in getTimeToConversion', { error: error.message });
    return null;
  }
}

export default {
  getConversionFunnel,
  getConversionFunnelForDays,
  getTimeToConversion
};
