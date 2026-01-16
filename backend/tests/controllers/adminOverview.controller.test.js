import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetAdminOverview = jest.fn();
const originalAdminKey = process.env.HRKEY_ADMIN_KEY;
process.env.HRKEY_ADMIN_KEY = 'test-admin-key-123456';

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
    requireAdmin: (req, _res, next) => next(),
    requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
    requireWalletLinked: () => (_req, _res, next) => next(),
    requireOwnWallet: (_field, _options) => (_req, _res, next) => next(),
    optionalAuth: (req, _res, next) => next()
  };
});

const { default: app } = await import('../../server.js');

describe('GET /api/admin/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.HRKEY_ADMIN_KEY = originalAdminKey;
  });

  test('allows admin key access', async () => {
    mockGetAdminOverview.mockResolvedValue({ auditEvents: { total: 1, last24h: 1, last7d: 1 } });

    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'test-admin-key-123456')
      .expect(200);

    expect(response.body.auditEvents.total).toBe(1);
    expect(mockGetAdminOverview).toHaveBeenCalledTimes(1);
  });

  test('returns 401 when admin key is missing', async () => {
    await request(app).get('/api/admin/overview').expect(401);
    expect(mockGetAdminOverview).not.toHaveBeenCalled();
  });

  test('returns 403 for invalid admin key', async () => {
    await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'invalid-admin-key-0000')
      .expect(403);

    expect(mockGetAdminOverview).not.toHaveBeenCalled();
  });

  test('handles service errors with 500', async () => {
    mockGetAdminOverview.mockRejectedValue(new Error('boom'));

    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'test-admin-key-123456')
      .expect(500);

    expect(response.body.error).toBe('Failed to load admin overview');
  });
});
