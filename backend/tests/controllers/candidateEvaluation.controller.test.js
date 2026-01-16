import { jest } from '@jest/globals';
import request from 'supertest';

const mockEvaluateCandidateForUser = jest.fn();

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: mockEvaluateCandidateForUser
}));

jest.unstable_mockModule('../../middleware/auth.js', () => {
  const requireAuth = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      req.user = JSON.parse(header);
    } catch (err) {
      req.user = { id: header, role: 'user' };
    }
    return next();
  };

  return {
    requireAuth,
    requireSuperadmin: (req, _res, next) => next(),
    requireCompanySigner: (req, _res, next) => next(),
    requireAdmin: (req, _res, next) => next(),
    requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
    requireWalletLinked: () => (_req, _res, next) => next(),
    requireOwnWallet: (_field, _options) => (_req, _res, next) => next(),
    optionalAuth: (req, _res, next) => next()
  };
});

const { default: app } = await import('../../server.js');

describe('GET /api/candidates/:userId/evaluation', () => {
  beforeEach(() => {
    mockEvaluateCandidateForUser.mockReset();
  });

  test('allows candidate to view their own evaluation', async () => {
    const result = {
      userId: 'user-1',
      scoring: {
        referenceAnalysis: {
          answers: [],
          aggregatedSignals: { teamImpact: 0, reliability: 0, communication: 0 }
        },
        hrScoreResult: { normalizedScore: 0.8, hrScore: 80 },
        pricingResult: { normalizedScore: 0.7, priceUsd: 95 }
      }
    };

    mockEvaluateCandidateForUser.mockResolvedValue(result);

    const response = await request(app)
      .get('/api/candidates/user-1/evaluation')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(200);

    expect(response.body.userId).toBe('user-1');
    expect(response.body.scoring?.hrScoreResult?.hrScore).toBe(80);
    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-1', {
      includeRawReferences: false
    });
  });

  test('allows superadmin to view another user evaluation', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({ userId: 'user-2', scoring: {} });

    await request(app)
      .get('/api/candidates/user-2/evaluation')
      .set('x-test-user', JSON.stringify({ id: 'admin-1', role: 'superadmin' }))
      .expect(200);

    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-2', {
      includeRawReferences: false
    });
  });

  test('can include raw references when requested', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({ userId: 'user-3', scoring: {}, rawReferences: [{}] });

    await request(app)
      .get('/api/candidates/user-3/evaluation?includeRawReferences=true')
      .set('x-test-user', JSON.stringify({ id: 'admin-1', role: 'superadmin' }))
      .expect(200);

    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-3', {
      includeRawReferences: true
    });
  });

  test('rejects other users attempting to view someone else', async () => {
    await request(app)
      .get('/api/candidates/user-1/evaluation')
      .set('x-test-user', JSON.stringify({ id: 'user-2', role: 'user' }))
      .expect(403);

    expect(mockEvaluateCandidateForUser).not.toHaveBeenCalled();
  });

  test('returns 400 when userId is missing', async () => {
    await request(app)
      .get('/api/candidates/%20/evaluation')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(400);

    expect(mockEvaluateCandidateForUser).not.toHaveBeenCalled();
  });

  test('returns 500 when evaluation fails', async () => {
    mockEvaluateCandidateForUser.mockRejectedValue(new Error('DB failed'));

    const response = await request(app)
      .get('/api/candidates/user-4/evaluation')
      .set('x-test-user', JSON.stringify({ id: 'user-4', role: 'user' }))
      .expect(500);

    expect(response.body.error).toBe('Failed to evaluate candidate');
  });
});
