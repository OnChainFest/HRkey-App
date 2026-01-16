import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetPublicProfile = jest.fn();

jest.unstable_mockModule('../../services/publicProfile/index.js', () => ({
  getPublicProfile: mockGetPublicProfile,
  getPublicIdentifierForUser: jest.fn()
}));

// Auth middleware is not applied to this public route, but other routes import it.
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => next(),
  requireSuperadmin: (req, _res, next) => next(),
  requireCompanySigner: (req, _res, next) => next(),
  requireAdmin: (req, _res, next) => next(),
  requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
  requireWalletLinked: () => (_req, _res, next) => next(),
  requireOwnWallet: (_field, _options) => (_req, _res, next) => next(),
  optionalAuth: (req, _res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('GET /api/public/candidates/:identifier', () => {
  beforeEach(() => {
    mockGetPublicProfile.mockReset();
  });

  test('returns profile when found', async () => {
    mockGetPublicProfile.mockResolvedValue({ userId: 'user-1', hrScore: 80, priceUsd: 100 });

    const response = await request(app)
      .get('/api/public/candidates/user-1')
      .expect(200);

    expect(response.body.userId).toBe('user-1');
    expect(mockGetPublicProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        trackView: true,
        viewerId: null,
        companyId: null
      })
    );
  });

  test('returns 400 when identifier missing', async () => {
    await request(app).get('/api/public/candidates/%20').expect(400);
    expect(mockGetPublicProfile).not.toHaveBeenCalled();
  });

  test('returns 404 when profile not found', async () => {
    mockGetPublicProfile.mockResolvedValue(null);

    await request(app).get('/api/public/candidates/unknown').expect(404);
  });

  test('returns 500 on service error', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/api/public/candidates/user-err').expect(500);
    expect(res.body.error).toBe('Failed to load public profile');
  });
});
