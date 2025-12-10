/**
 * Analytics Layer - Unit Tests
 *
 * Tests for analytics services:
 * - eventTracker (logEvent, logEventBatch, convenience functions)
 * - candidateMetrics
 * - companyMetrics
 * - conversionFunnel
 * - demandTrends
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js');

// ============================================================================
// EVENT TRACKER TESTS
// ============================================================================

describe('eventTracker', () => {
  let mockSupabase;
  let logEvent, logEventBatch, EventTypes, EventCategories;

  beforeEach(async () => {
    // Reset modules to get fresh instances
    jest.resetModules();

    // Setup Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn()
    };

    createClient.mockReturnValue(mockSupabase);

    // Import services after mocking
    const tracker = await import('../../services/analytics/eventTracker.js');
    logEvent = tracker.logEvent;
    logEventBatch = tracker.logEventBatch;
    EventTypes = tracker.EventTypes;
    EventCategories = tracker.EventCategories;
  });

  describe('logEvent', () => {
    it('should log a simple event successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'event-123',
          event_type: 'PAGE_VIEW',
          created_at: new Date().toISOString()
        },
        error: null
      });

      const result = await logEvent({
        userId: 'user-123',
        eventType: EventTypes.PAGE_VIEW,
        context: { page: '/dashboard' }
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('analytics_events');
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(result).toBeTruthy();
      expect(result.event_type).toBe('PAGE_VIEW');
    });

    it('should handle missing eventType gracefully', async () => {
      const result = await logEvent({
        userId: 'user-123',
        context: { page: '/dashboard' }
      });

      expect(result).toBeNull();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });

    it('should auto-determine event category', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'event-123', event_category: 'conversion' },
        error: null
      });

      await logEvent({
        userId: 'user-123',
        eventType: EventTypes.COMPANY_CREATED
      });

      const insertCall = mockSupabase.insert.mock.calls[0][0][0];
      expect(insertCall.event_category).toBe('conversion');
    });

    it('should extract metadata from request object', async () => {
      mockSupabase.single.mockResolvedValue({ data: {}, error: null });

      const mockReq = {
        ip: '192.168.1.1',
        get: jest.fn((header) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          if (header === 'referrer') return 'https://google.com';
          return null;
        }),
        path: '/api/analytics/dashboard',
        method: 'GET'
      };

      await logEvent({
        userId: 'user-123',
        eventType: EventTypes.PAGE_VIEW,
        req: mockReq
      });

      const insertCall = mockSupabase.insert.mock.calls[0][0][0];
      expect(insertCall.metadata.ip_address).toBe('192.168.1.1');
      expect(insertCall.metadata.user_agent).toBe('Mozilla/5.0');
      expect(insertCall.metadata.path).toBe('/api/analytics/dashboard');
      expect(insertCall.metadata.method).toBe('GET');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const result = await logEvent({
        userId: 'user-123',
        eventType: EventTypes.PAGE_VIEW
      });

      expect(result).toBeNull();
    });

    it('should never throw errors (fail silently)', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Critical failure');
      });

      await expect(
        logEvent({
          userId: 'user-123',
          eventType: EventTypes.PAGE_VIEW
        })
      ).resolves.toBeNull();
    });
  });

  describe('logEventBatch', () => {
    it('should log multiple events in batch', async () => {
      mockSupabase.select.mockResolvedValue({
        data: [
          { id: 'event-1', event_type: 'PAGE_VIEW' },
          { id: 'event-2', event_type: 'PROFILE_VIEW' }
        ],
        error: null
      });

      const events = [
        { userId: 'user-1', eventType: EventTypes.PAGE_VIEW },
        { userId: 'user-2', eventType: EventTypes.PROFILE_VIEW }
      ];

      const result = await logEventBatch(events);

      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should handle empty array', async () => {
      const result = await logEventBatch([]);
      expect(result).toEqual([]);
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });

    it('should handle batch insert failure gracefully', async () => {
      mockSupabase.select.mockResolvedValue({
        data: null,
        error: { message: 'Batch insert failed' }
      });

      const events = [
        { userId: 'user-1', eventType: EventTypes.PAGE_VIEW }
      ];

      const result = await logEventBatch(events);
      expect(result).toEqual([]);
    });
  });

  describe('EventTypes and EventCategories', () => {
    it('should export all required event types', () => {
      expect(EventTypes.PAGE_VIEW).toBe('PAGE_VIEW');
      expect(EventTypes.PROFILE_VIEW).toBe('PROFILE_VIEW');
      expect(EventTypes.SEARCH).toBe('CANDIDATE_SEARCH');
      expect(EventTypes.SIGNUP).toBe('USER_SIGNUP');
      expect(EventTypes.COMPANY_CREATED).toBe('COMPANY_CREATED');
      expect(EventTypes.DATA_ACCESS_REQUEST).toBe('DATA_ACCESS_REQUEST');
      expect(EventTypes.DATA_ACCESS_APPROVED).toBe('DATA_ACCESS_APPROVED');
      expect(EventTypes.PAYMENT_COMPLETED).toBe('PAYMENT_COMPLETED');
    });

    it('should export all event categories', () => {
      expect(EventCategories.ENGAGEMENT).toBe('engagement');
      expect(EventCategories.CONVERSION).toBe('conversion');
      expect(EventCategories.SEARCH).toBe('search');
      expect(EventCategories.REVENUE).toBe('revenue');
      expect(EventCategories.CONTENT).toBe('content');
      expect(EventCategories.ADMIN).toBe('admin');
    });
  });
});

// ============================================================================
// CONVERSION FUNNEL TESTS
// ============================================================================

describe('conversionFunnel', () => {
  let mockSupabase;
  let getConversionFunnel, getConversionFunnelForDays;

  beforeEach(async () => {
    jest.resetModules();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
    };

    createClient.mockReturnValue(mockSupabase);

    const funnel = await import('../../services/analytics/conversionFunnel.js');
    getConversionFunnel = funnel.getConversionFunnel;
    getConversionFunnelForDays = funnel.getConversionFunnelForDays;
  });

  describe('getConversionFunnel', () => {
    it('should calculate funnel with zero events', async () => {
      mockSupabase.in.mockResolvedValue({
        data: [],
        error: null
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = await getConversionFunnel({ startDate, endDate });

      expect(result).toBeTruthy();
      expect(result.stages).toHaveLength(5);
      expect(result.stages[0].name).toBe('Signups');
      expect(result.stages[0].count).toBe(0);
      expect(result.overall_conversion).toBe(0);
    });

    it('should calculate funnel with sample events', async () => {
      const mockEvents = [
        { event_type: 'USER_SIGNUP', user_id: 'user-1' },
        { event_type: 'USER_SIGNUP', user_id: 'user-2' },
        { event_type: 'COMPANY_CREATED', user_id: 'user-1' },
        { event_type: 'DATA_ACCESS_REQUEST', user_id: 'user-1' },
        { event_type: 'DATA_ACCESS_APPROVED', user_id: 'user-1' },
        { event_type: 'PAYMENT_COMPLETED', user_id: 'user-1' }
      ];

      mockSupabase.in.mockResolvedValue({
        data: mockEvents,
        error: null
      });

      const result = await getConversionFunnel({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(result.total_signups).toBe(2);
      expect(result.total_payments).toBe(1);
      expect(result.stages[0].count).toBe(2); // Signups
      expect(result.stages[1].count).toBe(1); // Companies
      expect(result.stages[4].count).toBe(1); // Payments
      expect(parseFloat(result.overall_conversion)).toBeCloseTo(50, 0); // 1/2 = 50%
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.in.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await getConversionFunnel({
        startDate: new Date(),
        endDate: new Date()
      });

      expect(result).toBeNull();
    });
  });

  describe('getConversionFunnelForDays', () => {
    it('should calculate funnel for last 30 days by default', async () => {
      mockSupabase.in.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await getConversionFunnelForDays();

      expect(mockSupabase.gte).toHaveBeenCalled();
      expect(mockSupabase.lte).toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    it('should accept custom days parameter', async () => {
      mockSupabase.in.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await getConversionFunnelForDays(7);
      expect(result).toBeTruthy();
    });
  });
});

// ============================================================================
// CANDIDATE METRICS TESTS
// ============================================================================

describe('candidateMetrics', () => {
  let mockSupabase;
  let getCandidateActivity, getCandidateProfileViews;

  beforeEach(async () => {
    jest.resetModules();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
    };

    createClient.mockReturnValue(mockSupabase);

    const metrics = await import('../../services/analytics/candidateMetrics.js');
    getCandidateActivity = metrics.getCandidateActivity;
    getCandidateProfileViews = metrics.getCandidateProfileViews;
  });

  describe('getCandidateActivity', () => {
    it('should aggregate candidate activity', async () => {
      const mockData = [
        { user_id: 'user-1', event_count: '10' },
        { user_id: 'user-2', event_count: '5' }
      ];

      mockSupabase.order.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getCandidateActivity({ days: 30 });

      expect(result).toBeTruthy();
      expect(result.candidates).toHaveLength(2);
      expect(result.period.days).toBe(30);
    });

    it('should handle empty results', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await getCandidateActivity({ days: 30 });
      expect(result.candidates).toHaveLength(0);
      expect(result.total_candidates).toBe(0);
    });
  });

  describe('getCandidateProfileViews', () => {
    it('should track profile view counts', async () => {
      const mockData = [
        {
          context: { candidateId: 'candidate-1' },
          view_count: '15',
          unique_companies: '3'
        }
      ];

      mockSupabase.order.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getCandidateProfileViews({ days: 30, limit: 50 });

      expect(result).toBeTruthy();
      expect(result.candidates).toHaveLength(1);
    });
  });
});

// ============================================================================
// COMPANY METRICS TESTS
// ============================================================================

describe('companyMetrics', () => {
  let mockSupabase;
  let getCompanyActivity, getCompanySearchBehavior;

  beforeEach(async () => {
    jest.resetModules();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      isNot: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
    };

    createClient.mockReturnValue(mockSupabase);

    const metrics = await import('../../services/analytics/companyMetrics.js');
    getCompanyActivity = metrics.getCompanyActivity;
    getCompanySearchBehavior = metrics.getCompanySearchBehavior;
  });

  describe('getCompanyActivity', () => {
    it('should aggregate company activity metrics', async () => {
      const mockData = [
        {
          company_id: 'company-1',
          total_events: '100',
          unique_users: '5',
          search_count: '20',
          request_count: '10'
        }
      ];

      mockSupabase.order.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getCompanyActivity({ days: 30 });

      expect(result).toBeTruthy();
      expect(result.companies).toHaveLength(1);
      expect(result.period.days).toBe(30);
    });

    it('should handle database errors', async () => {
      mockSupabase.order.mockResolvedValue({
        data: null,
        error: { message: 'Error' }
      });

      const result = await getCompanyActivity({ days: 30 });
      expect(result).toBeNull();
    });
  });

  describe('getCompanySearchBehavior', () => {
    it('should analyze search patterns', async () => {
      const mockData = [
        {
          company_id: 'company-1',
          context: {
            skills: ['JavaScript', 'React'],
            location: 'San Francisco'
          }
        }
      ];

      mockSupabase.eq.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getCompanySearchBehavior({
        companyId: 'company-1',
        days: 30
      });

      expect(result).toBeTruthy();
    });
  });
});

// ============================================================================
// DEMAND TRENDS TESTS
// ============================================================================

describe('demandTrends', () => {
  let mockSupabase;
  let getSkillDemandTrends, getTrendingSkills;

  beforeEach(async () => {
    jest.resetModules();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
    };

    createClient.mockReturnValue(mockSupabase);

    const trends = await import('../../services/analytics/demandTrends.js');
    getSkillDemandTrends = trends.getSkillDemandTrends;
    getTrendingSkills = trends.getTrendingSkills;
  });

  describe('getSkillDemandTrends', () => {
    it('should aggregate skill search counts', async () => {
      const mockData = [
        {
          context: {
            skills: ['JavaScript', 'React', 'Node.js']
          },
          company_id: 'company-1'
        },
        {
          context: {
            skills: ['JavaScript', 'Python']
          },
          company_id: 'company-2'
        }
      ];

      mockSupabase.eq.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getSkillDemandTrends({ days: 30 });

      expect(result).toBeTruthy();
      expect(result.skills).toBeDefined();
      expect(result.period.days).toBe(30);
    });

    it('should handle searches without skills', async () => {
      const mockData = [
        { context: { location: 'NYC' } }
      ];

      mockSupabase.eq.mockResolvedValue({
        data: mockData,
        error: null
      });

      const result = await getSkillDemandTrends({ days: 30 });
      expect(result).toBeTruthy();
    });
  });

  describe('getTrendingSkills', () => {
    it('should compare recent vs previous period', async () => {
      mockSupabase.eq.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await getTrendingSkills({ days: 7 });

      expect(result).toBeTruthy();
      expect(result.trending_up).toBeDefined();
      expect(result.trending_down).toBeDefined();
      expect(result.recent_period).toBeDefined();
      expect(result.comparison_period).toBeDefined();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Analytics Integration', () => {
  it('should provide consistent event types across modules', async () => {
    jest.resetModules();

    const tracker = await import('../../services/analytics/eventTracker.js');
    const index = await import('../../services/analytics/index.js');

    expect(tracker.EventTypes.PAGE_VIEW).toBe('PAGE_VIEW');
    expect(index.EventTypes.PAGE_VIEW).toBe('PAGE_VIEW');
  });

  it('should export all services from index', async () => {
    jest.resetModules();

    const analytics = await import('../../services/analytics/index.js');

    expect(analytics.logEvent).toBeDefined();
    expect(analytics.getCandidateActivity).toBeDefined();
    expect(analytics.getCompanyActivity).toBeDefined();
    expect(analytics.getConversionFunnel).toBeDefined();
    expect(analytics.getSkillDemandTrends).toBeDefined();
    expect(analytics.getAnalyticsDashboard).toBeDefined();
  });
});
