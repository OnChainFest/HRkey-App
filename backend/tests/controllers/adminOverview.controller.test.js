import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetAdminOverview = jest.fn();

jest.unstable_mockModule('../../services/adminOverview.service.js', () => ({
  getAdminOverview: mockGetAdminOverview
}));

jest.unstable_mockModule('../../middleware/auth.js', () => {
  const requireAuth = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) return res.status(401).json({ error: 'Unauthorized' });
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
    requireAdmin: (req, _res, next) => next()
  };
});

const { default: app } = await import('../../server.js');

describe('GET /api/admin/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows superadmin access', async () => {
    mockGetAdminOverview.mockResolvedValue({ auditEvents: { total: 1, last24h: 1, last7d: 1 } });

    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-test-user', JSON.stringify({ id: 'admin-1', role: 'superadmin' }))
      .expect(200);

    expect(response.body.auditEvents.total).toBe(1);
    expect(mockGetAdminOverview).toHaveBeenCalledTimes(1);
  });

  test('returns 401 when unauthenticated', async () => {
    await request(app).get('/api/admin/overview').expect(401);
    expect(mockGetAdminOverview).not.toHaveBeenCalled();
  });

  test('returns 403 for non-superadmin users', async () => {
    await request(app)
      .get('/api/admin/overview')
      .set('x-test-user', JSON.stringify({ id: 'user-1', role: 'user' }))
      .expect(403);

    expect(mockGetAdminOverview).not.toHaveBeenCalled();
  });

  test('handles service errors with 500', async () => {
    mockGetAdminOverview.mockRejectedValue(new Error('boom'));

    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-test-user', JSON.stringify({ id: 'admin-2', role: 'superadmin' }))
      .expect(500);

    expect(response.body.error).toBe('Failed to load admin overview');
  });
});
