/**
 * Express Request/Response Mocks
 * Helpers for creating mock Express req/res objects in tests
 */

import { jest } from '@jest/globals';

/**
 * Create a mock Express request object
 */
export function mockRequest(overrides = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    user: null,
    signer: null,
    ...overrides
  };
}

/**
 * Create a mock Express response object with Jest spies
 */
export function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis()
  };
  return res;
}

/**
 * Create a mock Express next() function
 */
export function mockNext() {
  return jest.fn();
}

/**
 * Create a complete mock request with Authorization header
 */
export function mockAuthenticatedRequest(token = 'valid-token', overrides = {}) {
  return mockRequest({
    headers: {
      authorization: `Bearer ${token}`
    },
    ...overrides
  });
}

/**
 * Create a mock request with user already authenticated
 */
export function mockAuthenticatedRequestWithUser(userData = {}, overrides = {}) {
  return mockRequest({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      identity_verified: false,
      ...userData
    },
    ...overrides
  });
}

/**
 * Create a mock request for company signer endpoints
 */
export function mockCompanySignerRequest(companyId = 'company-123', userData = {}, overrides = {}) {
  return mockRequest({
    params: {
      companyId: companyId
    },
    user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      ...userData
    },
    ...overrides
  });
}

export default {
  mockRequest,
  mockResponse,
  mockNext,
  mockAuthenticatedRequest,
  mockAuthenticatedRequestWithUser,
  mockCompanySignerRequest
};
