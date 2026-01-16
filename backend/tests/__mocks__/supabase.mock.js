/**
 * Supabase Client Mock
 * Provides mock implementation of Supabase client for testing
 */

import { jest } from '@jest/globals';

/**
 * Create a mock Supabase client with chainable query methods
 */
export function createMockSupabaseClient() {
  // Create a single persistent query builder that's returned for all .from() calls
  // This allows tests to set up mocks that work across multiple calls
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
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
    count: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  const mockClient = {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn().mockReturnValue(queryBuilder)
  };

  return mockClient;
}

/**
 * Reset query builder mocks after clearAllMocks()
 * Call this in beforeEach to restore chainable behavior
 */
export function resetQueryBuilderMocks(queryBuilder) {
  // Re-establish mockReturnThis() for all chainable methods
  queryBuilder.select.mockReturnThis();
  queryBuilder.insert.mockReturnThis();
  queryBuilder.update.mockReturnThis();
  queryBuilder.delete.mockReturnThis();
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
}

/**
 * Mock successful auth.getUser() response
 */
export function mockAuthGetUserSuccess(userId = 'user-123', email = 'test@example.com') {
  return {
    data: {
      user: {
        id: userId,
        email: email,
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
      message: message,
      status: 401
    }
  };
}

/**
 * Mock successful database query response
 */
export function mockDatabaseSuccess(data) {
  return {
    data: data,
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
      message: message,
      code: code,
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
