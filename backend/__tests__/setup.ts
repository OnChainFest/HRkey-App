/**
 * Global Test Setup
 * Runs before all tests to configure environment and mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key';
process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key';
process.env.ENCRYPTION_KEY = 'test-encryption-key-must-be-32-chars-exactly-here-12345';
process.env.RESEND_API_KEY = 're_test_key_1234567890';
process.env.BASE_RPC_URL = 'http://localhost:8545';
process.env.RLUSD_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000001';
process.env.PAYMENT_SPLITTER_ADDRESS = '0x0000000000000000000000000000000000000002';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global mock for console to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: originalConsole.error,
};
