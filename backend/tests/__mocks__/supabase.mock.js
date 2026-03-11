/**
 * Supabase Client Mock
 * Provides mock implementation of Supabase client for testing
 */

import { jest } from '@jest/globals';

/**
 * Create a mock Supabase query builder that:
 * - supports chainable methods (.select().eq().order()...)
 * - supports terminal methods (.single(), .maybeSingle())
 * - can also be awaited directly after non-terminal chains
 *   e.g. await supabase.from('x').select('*').eq('id', '1')
 */
function createMockQueryBuilder() {
  let currentResult = {
    data: null,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK'
  };

  const queryBuilder = {
    __setResult: jest.fn((result) => {
      currentResult = result;
      return queryBuilder;
    }),

    __getResult: jest.fn(() => currentResult),

    __resetResult: jest.fn(() => {
      currentResult = {
        data: null,
        error: null,
        count: null,
        status: 200,
        statusText: 'OK'
      };
      return queryBuilder;
    }),

    // Chainable query methods
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),

    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    containedBy: jest.fn().mockReturnThis(),
    rangeLt: jest.fn().mockReturnThis(),
    rangeGt: jest.fn().mockReturnThis(),
    rangeGte: jest.fn().mockReturnThis(),
    rangeLte: jest.fn().mockReturnThis(),
    rangeAdjacent: jest.fn().mockReturnThis(),
    overlaps: jest.fn().mockReturnThis(),
    textSearch: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),

    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),

    // Some codepaths call count() as chainable
    count: jest.fn().mockReturnThis(),

    // Terminal helpers
    single: jest.fn(() => Promise.resolve(currentResult)),
    maybeSingle: jest.fn(() => Promise.resolve(currentResult)),

    // Make the builder awaitable directly
    then: jest.fn((resolve, reject) => Promise.resolve(currentResult).then(resolve, reject)),
    catch: jest.fn((reject) => Promise.resolve(currentResult).catch(reject)),
    finally: jest.fn((handler) => Promise.resolve(currentResult).finally(handler))
  };

  return queryBuilder;
}

/**
 * Create a mock Supabase client with chainable query methods
 */
export function createMockSupabaseClient() {
  const queryBuilder = createMockQueryBuilder();

  const mockClient = {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn().mockReturnValue(queryBuilder),
    __queryBuilder: queryBuilder
  };

  return mockClient;
}

/**
 * Reset query builder mocks after clearAllMocks()
 * Call this in beforeEach to restore chainable behavior
 */
export function resetQueryBuilderMocks(queryBuilder) {
  queryBuilder.__resetResult?.();

  queryBuilder.select.mockReturnThis();
  queryBuilder.insert.mockReturnThis();
  queryBuilder.update.mockReturnThis();
  queryBuilder.delete.mockReturnThis();
  queryBuilder.upsert?.mockReturnThis?.();

  queryBuilder.eq.mockReturnThis();
  queryBuilder.neq.mockReturnThis();
  queryBuilder.gt.mockReturnThis();
  queryBuilder.lt.mockReturnThis();
  queryBuilder.gte.mockReturnThis();
  queryBuilder.lte.mockReturnThis();
  queryBuilder.like.mockReturnThis();
  queryBuilder.ilike.mockReturnThis();
  queryBuilder.is.mockReturnThis();
  queryBuilder.in.mockReturnThis();
  queryBuilder.contains.mockReturnThis();
  queryBuilder.containedBy.mockReturnThis();
  queryBuilder.rangeLt.mockReturnThis();
  queryBuilder.rangeGt.mockReturnThis();
  queryBuilder.rangeGte.mockReturnThis();
  queryBuilder.rangeLte.mockReturnThis();
  queryBuilder.rangeAdjacent.mockReturnThis();
  queryBuilder.overlaps.mockReturnThis();
  queryBuilder.textSearch.mockReturnThis();
  queryBuilder.match.mockReturnThis();
  queryBuilder.not.mockReturnThis();
  queryBuilder.or.mockReturnThis();
  queryBuilder.filter.mockReturnThis();

  queryBuilder.order.mockReturnThis();
  queryBuilder.limit.mockReturnThis();
  queryBuilder.range.mockReturnThis();
  queryBuilder.count.mockReturnThis();

  queryBuilder.single.mockImplementation(() => Promise.resolve(queryBuilder.__getResult()));
  queryBuilder.maybeSingle.mockImplementation(() => Promise.resolve(queryBuilder.__getResult()));

  queryBuilder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(queryBuilder.__getResult()).then(resolve, reject)
  );
  queryBuilder.catch.mockImplementation((reject) =>
    Promise.resolve(queryBuilder.__getResult()).catch(reject)
  );
  queryBuilder.finally.mockImplementation((handler) =>
    Promise.resolve(queryBuilder.__getResult()).finally(handler)
  );
}

/**
 * Mock successful auth.getUser() response
 */
export function mockAuthGetUserSuccess(userId = 'user-123', email = 'test@example.com') {
  return {
    data: {
      user: {
        id: userId,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: '2024-01-01T00:00:00Z'
      }
    },
    error: null
  };
}

/**
 * Mock failed auth.getUser() response (invalid token)
 */
export function mockAuthGetUserError(message = 'Invalid token') {
  return {
    data: { user: null },
    error: {
      message,
      status: 401
    }
  };
}

/**
 * Mock successful database query response
 */
export function mockDatabaseSuccess(data) {
  return {
    data,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK'
  };
}

/**
 * Mock failed database query response
 */
export function mockDatabaseError(message = 'Database error', code = 'PGRST116') {
  return {
    data: null,
    error: {
      message,
      code,
      details: null,
      hint: null
    },
    count: null,
    status: 400,
    statusText: 'Bad Request'
  };
}

/**
 * Mock user data from users table
 */
export function mockUserData(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user',
    identity_verified: false,
    wallet_address: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

/**
 * Mock company signer data
 */
export function mockCompanySignerData(overrides = {}) {
  return {
    id: 'signer-123',
    company_id: 'company-123',
    user_id: 'user-123',
    role: 'admin',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

export default {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData,
  mockCompanySignerData
};