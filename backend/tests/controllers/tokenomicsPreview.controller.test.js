import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetTokenomicsPreviewForUser = jest.fn();

jest.unstable_mockModule('../../services/tokenomicsPreview.service.js', () => ({
  getTokenomicsPreviewForUser: mockGetTokenomicsPreviewForUser
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

describe('GET /api/candidates/:userId/tokenomics-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows candidate to view their own tokenomics preview', async () => {
    mockGetTokenomicsPreviewForUser.mockResolvedValue({
      userId: 'user-1',
      priceUsd: 100,
      hrScore: 80,
      hrScoreNormalized: 0.8
    });

    const response = await request(app)
      .get('/api/candidates/user-1/tokenomics-preview')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(200);

    expect(response.body.userId).toBe('user-1');
    expect(response.body.priceUsd).toBe(100);
    expect(mockGetTokenomicsPreviewForUser).toHaveBeenCalledWith('user-1');
  });

  test('allows superadmin to view any tokenomics preview', async () => {
    mockGetTokenomicsPreviewForUser.mockResolvedValue({ userId: 'user-2', priceUsd: 80 });

    await request(app)
      .get('/api/candidates/user-2/tokenomics-preview')
      .set('x-test-user', JSON.stringify({ id: 'admin-1', role: 'superadmin' }))
      .expect(200);

    expect(mockGetTokenomicsPreviewForUser).toHaveBeenCalledWith('user-2');
  });

  test('rejects cross-user access for non-superadmins', async () => {
    await request(app)
      .get('/api/candidates/user-1/tokenomics-preview')
      .set('x-test-user', JSON.stringify({ id: 'user-2', role: 'user' }))
      .expect(403);

    expect(mockGetTokenomicsPreviewForUser).not.toHaveBeenCalled();
  });

  test('returns 400 when userId is missing', async () => {
    await request(app)
      .get('/api/candidates/%20/tokenomics-preview')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(400);

    expect(mockGetTokenomicsPreviewForUser).not.toHaveBeenCalled();
  });

  test('returns 500 when preview computation fails', async () => {
    mockGetTokenomicsPreviewForUser.mockRejectedValue(new Error('boom'));

    const response = await request(app)
      .get('/api/candidates/user-3/tokenomics-preview')
      .set('x-test-user', JSON.stringify({ id: 'user-3', role: 'user' }))
      .expect(500);

    expect(response.body.error).toBe('Failed to compute tokenomics preview');
  });
});
