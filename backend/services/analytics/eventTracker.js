/**
 * Event Tracker Service
 *
 * Core analytics event logging service. Captures user behavior,
 * system events, and product metrics for analysis.
 *
 * @module services/analytics/eventTracker
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Event type constants
export const EventTypes = {
  // Engagement events
  PAGE_VIEW: 'PAGE_VIEW',
  PROFILE_VIEW: 'PROFILE_VIEW',
  SEARCH: 'CANDIDATE_SEARCH',

  // Conversion events
  SIGNUP: 'USER_SIGNUP',
  COMPANY_CREATED: 'COMPANY_CREATED',
  SIGNER_INVITED: 'SIGNER_INVITED',
  DATA_ACCESS_REQUEST: 'DATA_ACCESS_REQUEST',
  DATA_ACCESS_APPROVED: 'DATA_ACCESS_APPROVED',
  DATA_ACCESS_REJECTED: 'DATA_ACCESS_REJECTED',

  // Revenue events
  PRICING_CALCULATED: 'PRICING_CALCULATED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYOUT_REQUESTED: 'PAYOUT_REQUESTED',

  // Content events
  REFERENCE_SUBMITTED: 'REFERENCE_SUBMITTED',
  REFERENCE_VALIDATED: 'REFERENCE_VALIDATED',
  KPI_OBSERVATION_CREATED: 'KPI_OBSERVATION_CREATED',
  HRSCORE_CALCULATED: 'HRSCORE_CALCULATED',

  // Admin events
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  COMPANY_VERIFIED: 'COMPANY_VERIFIED',
  REFERENCE_FLAGGED: 'REFERENCE_FLAGGED',
  REFERENCE_REVIEWED: 'REFERENCE_REVIEWED'
};

// Event categories
export const EventCategories = {
  ENGAGEMENT: 'engagement',
  CONVERSION: 'conversion',
  SEARCH: 'search',
  REVENUE: 'revenue',
  CONTENT: 'content',
  ADMIN: 'admin'
};

// Map event types to categories
const EVENT_CATEGORY_MAP = {
  [EventTypes.PAGE_VIEW]: EventCategories.ENGAGEMENT,
  [EventTypes.PROFILE_VIEW]: EventCategories.ENGAGEMENT,
  [EventTypes.SEARCH]: EventCategories.SEARCH,

  [EventTypes.SIGNUP]: EventCategories.CONVERSION,
  [EventTypes.COMPANY_CREATED]: EventCategories.CONVERSION,
  [EventTypes.SIGNER_INVITED]: EventCategories.CONVERSION,
  [EventTypes.DATA_ACCESS_REQUEST]: EventCategories.CONVERSION,
  [EventTypes.DATA_ACCESS_APPROVED]: EventCategories.CONVERSION,
  [EventTypes.DATA_ACCESS_REJECTED]: EventCategories.CONVERSION,

  [EventTypes.PRICING_CALCULATED]: EventCategories.REVENUE,
  [EventTypes.PAYMENT_INITIATED]: EventCategories.REVENUE,
  [EventTypes.PAYMENT_COMPLETED]: EventCategories.REVENUE,
  [EventTypes.PAYOUT_REQUESTED]: EventCategories.REVENUE,

  [EventTypes.REFERENCE_SUBMITTED]: EventCategories.CONTENT,
  [EventTypes.REFERENCE_VALIDATED]: EventCategories.CONTENT,
  [EventTypes.KPI_OBSERVATION_CREATED]: EventCategories.CONTENT,
  [EventTypes.HRSCORE_CALCULATED]: EventCategories.CONTENT,

  [EventTypes.USER_ROLE_CHANGED]: EventCategories.ADMIN,
  [EventTypes.COMPANY_VERIFIED]: EventCategories.ADMIN,
  [EventTypes.REFERENCE_FLAGGED]: EventCategories.ADMIN,
  [EventTypes.REFERENCE_REVIEWED]: EventCategories.ADMIN
};

/**
 * Logs an analytics event.
 *
 * @param {Object} params - Event parameters
 * @param {string} [params.userId] - User ID (nullable for system events)
 * @param {string} [params.companyId] - Company ID (nullable)
 * @param {string} params.eventType - Event type (use EventTypes constants)
 * @param {Object} [params.context] - Event-specific context data
 * @param {string} [params.source='backend'] - Event source (frontend|backend|api|webhook)
 * @param {string} [params.sessionId] - Session identifier (optional)
 * @param {Object} [params.metadata] - Request metadata (IP, user agent, etc.)
 * @param {Object} [params.req] - Express request object (auto-extracts metadata)
 * @returns {Promise<Object|null>} Created event or null on error
 *
 * @example
 * await logEvent({
 *   userId: 'uuid-123',
 *   companyId: 'uuid-456',
 *   eventType: EventTypes.PROFILE_VIEW,
 *   context: { candidateId: 'uuid-789', dataType: 'profile' },
 *   req
 * });
 */
export async function logEvent({
  userId = null,
  companyId = null,
  eventType,
  context = {},
  source = 'backend',
  sessionId = null,
  metadata = {},
  req = null
}) {
  try {
    // Validate required fields
    if (!eventType) {
      logger.warn('Analytics: eventType is required, skipping event');
      return null;
    }

    // Auto-determine category from event type
    const eventCategory = EVENT_CATEGORY_MAP[eventType] || null;

    // Extract metadata from request if provided
    let enrichedMetadata = { ...metadata };
    if (req) {
      enrichedMetadata = {
        ...enrichedMetadata,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.get('user-agent'),
        referrer: req.get('referrer') || req.get('referer'),
        path: req.path,
        method: req.method
      };
    }

    // Prepare event payload
    const eventPayload = {
      user_id: userId,
      company_id: companyId,
      event_type: eventType,
      event_category: eventCategory,
      context: context,
      source: source,
      session_id: sessionId,
      metadata: enrichedMetadata
    };

    // Insert event into database
    const { data, error } = await supabase
      .from('analytics_events')
      .insert([eventPayload])
      .select()
      .single();

    if (error) {
      logger.error('Analytics: Failed to log event', {
        error: error.message,
        eventType,
        userId
      });
      return null;
    }

    logger.debug('Analytics: Event logged', {
      eventType,
      eventCategory,
      userId,
      companyId
    });

    return data;

  } catch (error) {
    // Analytics failures should NEVER break application flow
    logger.error('Analytics: Exception in logEvent', {
      error: error.message,
      stack: error.stack,
      eventType
    });
    return null;
  }
}

/**
 * Logs multiple events in batch (for efficiency).
 *
 * @param {Array<Object>} events - Array of event objects
 * @returns {Promise<Array>} Array of created events
 */
export async function logEventBatch(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  try {
    // Prepare all events
    const eventPayloads = events.map(event => ({
      user_id: event.userId || null,
      company_id: event.companyId || null,
      event_type: event.eventType,
      event_category: EVENT_CATEGORY_MAP[event.eventType] || null,
      context: event.context || {},
      source: event.source || 'backend',
      session_id: event.sessionId || null,
      metadata: event.metadata || {}
    }));

    // Batch insert
    const { data, error } = await supabase
      .from('analytics_events')
      .insert(eventPayloads)
      .select();

    if (error) {
      logger.error('Analytics: Batch insert failed', {
        error: error.message,
        eventCount: events.length
      });
      return [];
    }

    logger.debug('Analytics: Batch logged', {
      eventCount: data.length
    });

    return data;

  } catch (error) {
    logger.error('Analytics: Exception in logEventBatch', {
      error: error.message,
      eventCount: events.length
    });
    return [];
  }
}

/**
 * Convenience function: Log page view event.
 *
 * @param {string} userId - User ID
 * @param {string} page - Page identifier
 * @param {Object} req - Express request object
 */
export async function logPageView(userId, page, req = null) {
  return logEvent({
    userId,
    eventType: EventTypes.PAGE_VIEW,
    context: { page },
    source: 'frontend',
    req
  });
}

/**
 * Convenience function: Log candidate search event.
 *
 * @param {string} userId - User ID
 * @param {string} companyId - Company ID
 * @param {Object} searchParams - Search parameters (skills, location, etc.)
 * @param {Object} req - Express request object
 */
export async function logCandidateSearch(userId, companyId, searchParams, req = null) {
  return logEvent({
    userId,
    companyId,
    eventType: EventTypes.SEARCH,
    context: { ...searchParams },
    req
  });
}

/**
 * Convenience function: Log profile view event.
 *
 * @param {string} userId - User viewing
 * @param {string} companyId - Company ID
 * @param {string} candidateId - Candidate being viewed
 * @param {string} dataType - Type of data viewed
 * @param {Object} req - Express request object
 */
export async function logProfileView(userId, companyId, candidateId, dataType, req = null) {
  return logEvent({
    userId,
    companyId,
    eventType: EventTypes.PROFILE_VIEW,
    context: { candidateId, dataType },
    req
  });
}

/**
 * Convenience function: Log data access request.
 *
 * @param {string} userId - Requesting user
 * @param {string} companyId - Company ID
 * @param {string} targetUserId - Target candidate
 * @param {string} dataType - Type of data requested
 * @param {number} price - Price amount
 * @param {Object} req - Express request object
 */
export async function logDataAccessRequest(userId, companyId, targetUserId, dataType, price, req = null) {
  return logEvent({
    userId,
    companyId,
    eventType: EventTypes.DATA_ACCESS_REQUEST,
    context: { targetUserId, dataType, price },
    req
  });
}

/**
 * Gets event type constants (for external use).
 *
 * @returns {Object} EventTypes enum
 */
export function getEventTypes() {
  return EventTypes;
}

/**
 * Gets event category constants (for external use).
 *
 * @returns {Object} EventCategories enum
 */
export function getEventCategories() {
  return EventCategories;
}

export default {
  logEvent,
  logEventBatch,
  logPageView,
  logCandidateSearch,
  logProfileView,
  logDataAccessRequest,
  getEventTypes,
  getEventCategories,
  EventTypes,
  EventCategories
};
