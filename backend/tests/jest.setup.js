/**
 * Jest Setup File
 * Configures global mocks and environment variables for testing
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.BACKEND_PUBLIC_URL = 'http://localhost:3001';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global beforeAll
beforeAll(() => {
  console.log('🧪 Starting test suite...');
});

// Global afterAll
afterAll(() => {
  console.log('✅ Test suite completed');
});

// Suppress console errors during tests (optional)
// Uncomment if you want cleaner test output
// global.console = {
//   ...console,
//   error: jest.fn(),
//   warn: jest.fn(),
// };
