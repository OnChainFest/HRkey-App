import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetPublicIdentifierForUser = jest.fn();
const mockGetPublicProfile = jest.fn();

jest.unstable_mockModule('../../services/publicProfile.service.js', () => ({
  getPublicIdentifierForUser: mockGetPublicIdentifierForUser,
  getPublicProfile: mockGetPublicProfile
}));

jest.unstable_mockModule('../../middleware/auth.js', () => {
  const requireAuth = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) return res.status(401).json({ error: 'Authentication required' });
    req.user = JSON.parse(header);
    return next();
  };
  return {
    requireAuth,
    requireSuperadmin: (req, _res, next) => next(),
    requireCompanySigner: (req, _res, next) => next(),
    requireAdmin: (req, _res, next) => next()
  };
});

const { default: app } = await import('../../server.js');

describe('GET /api/me/public-identifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns identifier for authenticated user', async () => {
    mockGetPublicIdentifierForUser.mockResolvedValue({
      userId: 'user-1',
      identifier: 'public-handle',
      handle: 'public-handle',
      isPublicProfile: true
    });

    const response = await request(app)
      .get('/api/me/public-identifier')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(200);

    expect(response.body.identifier).toBe('public-handle');
    expect(mockGetPublicIdentifierForUser).toHaveBeenCalledWith('user-1');
  });

  test('rejects unauthenticated requests', async () => {
    await request(app).get('/api/me/public-identifier').expect(401);
    expect(mockGetPublicIdentifierForUser).not.toHaveBeenCalled();
  });

  test('returns 404 when identifier missing', async () => {
    mockGetPublicIdentifierForUser.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/me/public-identifier')
      .set('x-test-user', JSON.stringify({ id: 'user-2', role: 'user' }))
      .expect(404);

    expect(response.body.error).toBe('Public identifier not found');
  });

  test('handles service errors', async () => {
    mockGetPublicIdentifierForUser.mockRejectedValue(new Error('boom'));

    const response = await request(app)
      .get('/api/me/public-identifier')
      .set('x-test-user', JSON.stringify({ id: 'user-3', role: 'user' }))
      .expect(500);

    expect(response.body.error).toBe('Failed to resolve public identifier');
  });
});
