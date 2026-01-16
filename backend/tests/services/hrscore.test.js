/**
 * HRScore Persistence & Automation Layer - Unit Tests
 *
 * Tests for HRScore service layer:
 * - scoreCalculator (calculateAndPersistScore, batch operations)
 * - scoreHistory (getLatestScore, getScoreHistory, improvement metrics)
 * - autoTrigger (onReferenceValidated, onKpiObservationCreated)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Supabase client
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

// Mock hrkeyScoreService
jest.unstable_mockModule('../../hrkeyScoreService.js', () => ({
  computeHrkeyScore: jest.fn()
}));

// Mock analytics
jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue(null),
  EventTypes: {
    HRSCORE_CALCULATED: 'HRSCORE_CALCULATED',
    HRSCORE_IMPROVED: 'HRSCORE_IMPROVED',
    HRSCORE_DECLINED: 'HRSCORE_DECLINED'
  }
}));

let createClient;

// ============================================================================
// SCORE CALCULATOR TESTS
// ============================================================================

describe('scoreCalculator', () => {
  let mockSupabase;
  let calculateAndPersistScore, recalculateScore;
  let computeHrkeyScore;
  let logEvent;

  beforeEach(async () => {
    // Reset modules
    jest.resetModules();
    jest.clearAllMocks();

    // Setup Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    };

    ({ createClient } = await import('@supabase/supabase-js'));
    createClient.mockReturnValue(mockSupabase);

    // Import after mocking
    const calculator = await import('../../services/hrscore/scoreCalculator.js');
    calculateAndPersistScore = calculator.calculateAndPersistScore;
    recalculateScore = calculator.recalculateScore;

    const scoreService = await import('../../hrkeyScoreService.js');
    computeHrkeyScore = scoreService.computeHrkeyScore;

    const analytics = await import('../../services/analytics/eventTracker.js');
    logEvent = analytics.logEvent;
  });

  describe('calculateAndPersistScore', () => {
    it('should calculate and persist score successfully', async () => {
      // Mock user lookup
      mockSupabase.single
        .mockResolvedValueOnce({
          data: {
            id: 'user-123',
            wallet_address: '0xABC',
            email: 'user@example.com'
          },
          error: null
        })
        .mockResolvedValueOnce({
          data: {
            id: 'score-123',
            user_id: 'user-123',
            role_id: null,
            score: 78.45,
            confidence: 0.89,
            n_observations: 16,
            created_at: new Date().toISOString(),
            metadata: { score_delta: null }
          },
          error: null
        });

      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock hrkeyScoreService
      computeHrkeyScore.mockResolvedValue({
        ok: true,
        score: 78.45,
        raw_prediction: 125432.50,
        confidence: 0.89,
        n_observations: 16,
        used_kpis: ['kpi_1', 'kpi_2'],
        model_info: {
          model_type: 'ridge',
          trained_at: '2025-12-11T...',
          role_scope: 'global'
        },
        debug: {
          kpi_averages: { kpi_1: 4.5, kpi_2: 4.2 },
          feature_vector: [4.5, 4.2],
          target_stats: { min: 60000, max: 180000 }
        }
      });

      const result = await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null,
        triggerSource: 'manual'
      });

      expect(result).toBeTruthy();
      expect(result.score).toBe(78.45);
      expect(result.user_id).toBe('user-123');
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalled();
    });

    it('should return null if user not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'User not found' }
      });

      const result = await calculateAndPersistScore({
        userId: 'nonexistent',
        roleId: null
      });

      expect(result).toBeNull();
      expect(computeHrkeyScore).not.toHaveBeenCalled();
    });

    it('should return null if user has no wallet', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'user-123',
          wallet_address: null,
          email: 'user@example.com'
        },
        error: null
      });

      const result = await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null
      });

      expect(result).toBeNull();
      expect(computeHrkeyScore).not.toHaveBeenCalled();
    });

    it('should return null if score computation fails', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'user-123',
          wallet_address: '0xABC',
          email: 'user@example.com'
        },
        error: null
      });
      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      computeHrkeyScore.mockResolvedValue({
        ok: false,
        reason: 'NOT_ENOUGH_DATA',
        message: 'Insufficient observations'
      });

      const result = await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null
      });

      expect(result).toBeNull();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });

    it('should calculate score delta when previous scores exist', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: {
            id: 'user-123',
            wallet_address: '0xABC',
            email: 'user@example.com'
          },
          error: null
        })
        .mockResolvedValueOnce({
          data: {
            id: 'score-123',
            user_id: 'user-123',
            score: 78.45,
            metadata: {
              previous_score: 70.00,
              score_delta: 8.45
            }
          },
          error: null
        });

      mockSupabase.limit.mockResolvedValueOnce({
        data: [
          {
            id: 'prev-score-123',
            user_id: 'user-123',
            score: 70.00,
            created_at: '2025-12-10T00:00:00Z'
          }
        ],
        error: null
      });

      computeHrkeyScore.mockResolvedValue({
        ok: true,
        score: 78.45,
        confidence: 0.89,
        n_observations: 16,
        used_kpis: [],
        model_info: {},
        debug: {}
      });

      const result = await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null
      });

      expect(result).toBeTruthy();
      expect(result.metadata.score_delta).toBe(8.45);
    });

    it('should emit HRSCORE_IMPROVED event for significant improvement', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { id: 'user-123', wallet_address: '0xABC', email: 'user@example.com' },
          error: null
        })
        .mockResolvedValueOnce({
          data: {
            id: 'score-123',
            score: 80.00,
            metadata: { score_delta: 10.00, previous_score: 70.00 }
          },
          error: null
        });

      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ score: 70.00 }],
        error: null
      });

      computeHrkeyScore.mockResolvedValue({
        ok: true,
        score: 80.00,
        confidence: 0.9,
        n_observations: 20,
        used_kpis: [],
        model_info: {},
        debug: {}
      });

      await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null
      });

      // Should emit both CALCULATED and IMPROVED events
      expect(logEvent).toHaveBeenCalledTimes(2);
      const calls = logEvent.mock.calls;
      expect(calls[0][0].eventType).toBe('HRSCORE_CALCULATED');
      expect(calls[1][0].eventType).toBe('HRSCORE_IMPROVED');
    });

    it('should fail softly on analytics errors', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { id: 'user-123', wallet_address: '0xABC', email: 'user@example.com' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { id: 'score-123', score: 78.45, metadata: { score_delta: null } },
          error: null
        });

      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });

      computeHrkeyScore.mockResolvedValue({
        ok: true,
        score: 78.45,
        confidence: 0.89,
        n_observations: 16,
        used_kpis: [],
        model_info: {},
        debug: {}
      });

      // Analytics throws error
      logEvent.mockRejectedValue(new Error('Analytics failure'));

      const result = await calculateAndPersistScore({
        userId: 'user-123',
        roleId: null
      });

      // Score should still be persisted
      expect(result).toBeTruthy();
      expect(result.score).toBe(78.45);
    });
  });

  describe('recalculateScore', () => {
    it('should force recalculation with manual trigger', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'user-123', wallet_address: '0xABC' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'score-123', score: 78.45, metadata: { score_delta: null } }, error: null });

      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
      computeHrkeyScore.mockResolvedValue({
        ok: true,
        score: 78.45,
        confidence: 0.89,
        n_observations: 16,
        used_kpis: [],
        model_info: {},
        debug: {}
      });

      const result = await recalculateScore({
        userId: 'user-123',
        roleId: null
      });

      expect(result).toBeTruthy();
      expect(result.score).toBe(78.45);
    });
  });
});

// ============================================================================
// SCORE HISTORY TESTS
// ============================================================================

describe('scoreHistory', () => {
  let mockSupabase;
  let getLatestScore, getScoreHistory, getScoreImprovement;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      single: jest.fn()
    };

    ({ createClient } = await import('@supabase/supabase-js'));
    createClient.mockReturnValue(mockSupabase);

    const history = await import('../../services/hrscore/scoreHistory.js');
    getLatestScore = history.getLatestScore;
    getScoreHistory = history.getScoreHistory;
    getScoreImprovement = history.getScoreImprovement;
  });

  describe('getLatestScore', () => {
    it('should return latest score for user', async () => {
      const mockScore = {
        id: 'score-123',
        user_id: 'user-123',
        score: 78.45,
        confidence: 0.89,
        created_at: '2025-12-11T12:00:00Z'
      };

      mockSupabase.maybeSingle.mockResolvedValue({
        data: mockScore,
        error: null
      });

      const result = await getLatestScore({ userId: 'user-123' });

      expect(result).toEqual(mockScore);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase.limit).toHaveBeenCalledWith(1);
    });

    it('should filter by roleId if provided', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { id: 'score-123', score: 78.45 },
        error: null
      });

      await getLatestScore({ userId: 'user-123', roleId: 'role-456' });

      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('role_id', 'role-456');
    });

    it('should return null if no score found', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: null
      });

      const result = await getLatestScore({ userId: 'user-123' });

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await getLatestScore({ userId: 'user-123' });

      expect(result).toBeNull();
    });
  });

  describe('getScoreHistory', () => {
    it('should return score history with deltas', async () => {
      const mockHistory = [
        { id: 'score-3', score: 80.00, created_at: '2025-12-11T12:00:00Z' },
        { id: 'score-2', score: 75.00, created_at: '2025-12-10T12:00:00Z' },
        { id: 'score-1', score: 70.00, created_at: '2025-12-09T12:00:00Z' }
      ];

      mockSupabase.limit.mockResolvedValue({
        data: mockHistory,
        error: null
      });

      const result = await getScoreHistory({
        userId: 'user-123',
        days: 30
      });

      expect(result).toHaveLength(3);
      expect(result[0].score_delta).toBe(5.00); // 80 - 75
      expect(result[0].score_trend).toBe('improved');
      expect(result[1].score_delta).toBe(5.00); // 75 - 70
      expect(result[1].score_trend).toBe('improved');
      expect(result[2].score_delta).toBeNull(); // Last entry has no previous
      expect(result[2].score_trend).toBe('first_score');
    });

    it('should return empty array if no history found', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await getScoreHistory({ userId: 'user-123' });

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: null,
        error: { message: 'Error' }
      });

      const result = await getScoreHistory({ userId: 'user-123' });

      expect(result).toEqual([]);
    });
  });

  describe('getScoreImprovement', () => {
    it('should calculate improvement metrics', async () => {
      const mockHistory = [
        { id: 'score-2', score: 80.00, created_at: '2025-12-11T00:00:00Z' },
        { id: 'score-1', score: 70.00, created_at: '2025-12-01T00:00:00Z' }
      ];

      mockSupabase.limit.mockResolvedValue({
        data: mockHistory,
        error: null
      });

      const result = await getScoreImprovement({
        userId: 'user-123',
        days: 30
      });

      expect(result.hasImprovement).toBe(true);
      expect(result.currentScore).toBe(80.00);
      expect(result.initialScore).toBe(70.00);
      expect(result.absoluteChange).toBe(10.00);
      expect(result.percentageChange).toBeCloseTo(14.29, 1); // (10/70)*100
    });

    it('should handle insufficient data', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [{ score: 75.00 }],
        error: null
      });

      const result = await getScoreImprovement({
        userId: 'user-123',
        days: 30
      });

      expect(result.hasImprovement).toBe(false);
      expect(result.message).toContain('Not enough historical data');
      expect(result.dataPoints).toBe(1);
    });
  });
});

// ============================================================================
// AUTO TRIGGER TESTS
// ============================================================================

describe('autoTrigger', () => {
  let mockSupabase;
  let onReferenceValidated, onKpiObservationCreated;
  let calculateAndPersistScore;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn()
    };

    ({ createClient } = await import('@supabase/supabase-js'));
    createClient.mockReturnValue(mockSupabase);

    // Mock calculateAndPersistScore
    jest.doMock('../../services/hrscore/scoreCalculator.js', () => ({
      calculateAndPersistScore: jest.fn().mockResolvedValue({
        id: 'score-123',
        score: 78.45
      })
    }));

    const trigger = await import('../../services/hrscore/autoTrigger.js');
    onReferenceValidated = trigger.onReferenceValidated;
    onKpiObservationCreated = trigger.onKpiObservationCreated;
  });

  describe('onReferenceValidated', () => {
    it('should trigger score calculation for validated reference', async () => {
      // Mock reference lookup
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'ref-123',
          owner_id: 'user-123',
          validation_status: 'VALIDATED',
          fraud_score: 10
        },
        error: null
      });

      const result = await onReferenceValidated('ref-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('references');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'ref-123');
    });

    it('should return null if reference not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await onReferenceValidated('nonexistent');

      expect(result).toBeNull();
    });

    it('should skip if reference not validated', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'ref-123',
          owner_id: 'user-123',
          validation_status: 'PENDING',
          fraud_score: 10
        },
        error: null
      });

      const result = await onReferenceValidated('ref-123');

      expect(result).toBeNull();
    });

    it('should skip if fraud score is high', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'ref-123',
          owner_id: 'user-123',
          validation_status: 'VALIDATED',
          fraud_score: 80
        },
        error: null
      });

      const result = await onReferenceValidated('ref-123');

      expect(result).toBeNull();
    });

    it('should fail softly on errors', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      const result = await onReferenceValidated('ref-123');

      expect(result).toBeNull();
    });
  });

  describe('onKpiObservationCreated', () => {
    it('should trigger score calculation for new KPI observation', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'user-123',
          wallet_address: '0xABC'
        },
        error: null
      });

      const result = await onKpiObservationCreated('0xABC', 'role-456');

      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      expect(mockSupabase.eq).toHaveBeenCalledWith('wallet_address', '0xABC');
    });

    it('should return null if user not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await onKpiObservationCreated('0xNONEXISTENT', 'role-456');

      expect(result).toBeNull();
    });

    it('should fail softly on errors', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database error'));

      const result = await onKpiObservationCreated('0xABC', 'role-456');

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('HRScore Integration', () => {
  it('should export all required functions', async () => {
    const hrscoreIndex = await import('../../services/hrscore/index.js');

    expect(hrscoreIndex.calculateAndPersistScore).toBeDefined();
    expect(hrscoreIndex.getLatestScore).toBeDefined();
    expect(hrscoreIndex.getScoreHistory).toBeDefined();
    expect(hrscoreIndex.onReferenceValidated).toBeDefined();
    expect(hrscoreIndex.getHRScoreLayerInfo).toBeDefined();
  });

  it('should provide layer metadata', async () => {
    const hrscoreIndex = await import('../../services/hrscore/index.js');

    const info = hrscoreIndex.getHRScoreLayerInfo();

    expect(info.name).toContain('HRScore');
    expect(info.version).toBeDefined();
    expect(info.features).toBeInstanceOf(Array);
    expect(info.features.length).toBeGreaterThan(0);
  });
});
