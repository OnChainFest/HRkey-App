/**
 * Rate Limiting Integration Tests
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockDatabaseSuccess
} from '../__mocks__/supabase.mock.js';
import { resetRateLimiter } from '../../middleware/rateLimit.js';

const originalEnv = { ...process.env };

process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_API_MAX = '2';
process.env.RATE_LIMIT_AUTH_MAX = '2';
process.env.RATE_LIMIT_TOKEN_MAX = '2';
process.env.RATE_LIMIT_HRSCORE_MAX = '2';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

function buildTableMock({
  singleResponses = [],
  maybeSingleResponses = [],
  selectResponse = null
} = {}) {
  const builder = {
    select: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
  );

  builder.select.mockImplementation(() => (selectResponse ? Promise.resolve(selectResponse) : builder));

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation((table) => tableMocks[table] || mockQueryBuilder);
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendSignerInvitation: jest.fn().mockResolvedValue(),
  sendCompanyVerificationNotification: jest.fn().mockResolvedValue(),
  sendIdentityVerificationConfirmation: jest.fn().mockResolvedValue(),
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logAudit: jest.fn().mockResolvedValue(),
  logIdentityVerification: jest.fn().mockResolvedValue(),
  logCompanyCreation: jest.fn().mockResolvedValue(),
  logCompanyVerification: jest.fn().mockResolvedValue(),
  logSignerInvitation: jest.fn().mockResolvedValue(),
  logSignerAcceptance: jest.fn().mockResolvedValue(),
  logSignerStatusChange: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {},
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('Rate Limiting Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
    resetRateLimiter();
    process.env.RATE_LIMIT_ALLOWLIST = '';
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  test('rate limits auth route group', async () => {
    const responses = await Promise.all([
      request(app).get('/api/auth/login'),
      request(app).get('/api/auth/login')
    ]);

    responses.forEach((response) => {
      expect(response.status).not.toBe(429);
    });

    const blocked = await request(app).get('/api/auth/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  test('rate limits reference token endpoints', async () => {
    const referenceInvitesTable = buildTableMock({
      maybeSingleResponses: [mockDatabaseSuccess(null)]
    });

    configureTableMocks({
      reference_invites: referenceInvitesTable
    });

    await request(app).get('/api/reference/by-token/test-token');
    await request(app).get('/api/reference/by-token/test-token');

    const blocked = await request(app).get('/api/reference/by-token/test-token');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  test('rate limits hrscore read endpoints', async () => {
    await request(app).get('/api/hrkey-score/model-info');
    await request(app).get('/api/hrkey-score/model-info');

    const blocked = await request(app).get('/api/hrkey-score/model-info');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  test('rate limits global api group', async () => {
    await request(app).get('/api/identity/status/test-user');
    await request(app).get('/api/identity/status/test-user');

    const blocked = await request(app).get('/api/identity/status/test-user');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  test('allowlist bypasses rate limiting', async () => {
    process.env.RATE_LIMIT_ALLOWLIST = '10.0.0.1';

    const responses = await Promise.all([
      request(app).get('/api/hrkey-score/model-info').set('x-forwarded-for', '10.0.0.1'),
      request(app).get('/api/hrkey-score/model-info').set('x-forwarded-for', '10.0.0.1'),
      request(app).get('/api/hrkey-score/model-info').set('x-forwarded-for', '10.0.0.1')
    ]);

    responses.forEach((response) => {
      expect(response.status).not.toBe(429);
    });
  });
});
