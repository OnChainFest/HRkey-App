import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockSupabaseClient = {
  from: jest.fn()
};

const assertRecruiterCanAccessReferencePackMock = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/referenceAccess.service.js', () => ({
  assertRecruiterCanAccessReferencePack: assertRecruiterCanAccessReferencePackMock
}));

const middlewareModule = await import('../../middleware/referenceAccess.js');
const {
  requireReferenceAccessPermission,
  requireReferenceAccessForDataAccessRequest,
  __setSupabaseClientForTests
} = middlewareModule;

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createBuilder({ singleQueue = [] } = {}) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null }))
  };
  return builder;
}

describe('reference access middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setSupabaseClientForTests(mockSupabaseClient);
  });

  test('allows candidate owner access', async () => {
    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' }),
      allowSuperadmin: true
    });
    const req = { user: { id: 'candidate-1', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.referenceAccess.accessLevel).toBe('owner');
    expect(assertRecruiterCanAccessReferencePackMock).not.toHaveBeenCalled();
  });

  test('allows superadmin only when explicitly enabled', async () => {
    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' }),
      allowSuperadmin: true
    });
    const req = { user: { id: 'super-1', role: 'superadmin' }, params: {}, path: '/test' };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.referenceAccess.accessLevel).toBe('superadmin');
    expect(assertRecruiterCanAccessReferencePackMock).not.toHaveBeenCalled();
  });

  test('denies unauthorized authenticated user', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' })
    });
    const req = { user: { id: 'user-2', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Explicit reference access is required');
    expect(next).not.toHaveBeenCalled();
  });

  test('denies recruiter without explicit grant', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1', targetId: 'candidate-1' })
    });
    const req = { user: { id: 'recruiter-1', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();

    await middleware(req, res, jest.fn());

    expect(assertRecruiterCanAccessReferencePackMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      targetId: 'candidate-1'
    }));
    expect(res.statusCode).toBe(403);
  });

  test('denies recruiter with expired grant', async () => {
    const error = new Error('Reference access grant has expired');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' })
    });
    const req = { user: { id: 'recruiter-1', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();

    await middleware(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Reference access grant has expired');
  });

  test('allows recruiter with active explicit grant', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });

    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' })
    });
    const req = { user: { id: 'recruiter-1', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.referenceAccess.accessLevel).toBe('explicit_grant');
    expect(req.referenceAccess.grant).toEqual({ id: 'grant-1', status: 'active' });
  });

  test('denies inactive recruiter identity via service enforcement', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const middleware = requireReferenceAccessPermission({
      resolveSubject: async () => ({ candidateUserId: 'candidate-1' })
    });
    const req = { user: { id: 'inactive-recruiter', role: 'user' }, params: {}, path: '/test' };
    const res = createRes();

    await middleware(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(assertRecruiterCanAccessReferencePackMock).toHaveBeenCalledWith(expect.objectContaining({
      recruiterUserId: 'inactive-recruiter'
    }));
  });

  test('data access resolver skips reference permission for non-reference payloads', async () => {
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'data_access_requests') {
        return createBuilder({
          singleQueue: [{
            data: {
              id: 'req-1',
              target_user_id: 'candidate-1',
              requested_data_type: 'basic_metadata',
              reference_id: null
            },
            error: null
          }]
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const middleware = requireReferenceAccessForDataAccessRequest();
    const req = { user: { id: 'recruiter-1', role: 'user' }, params: { requestId: 'req-1' }, path: '/test' };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.referenceAccess.accessLevel).toBe('not_applicable');
    expect(assertRecruiterCanAccessReferencePackMock).not.toHaveBeenCalled();
  });
});

