/**
 * Jest Configuration for HRKey Backend
 * Configured for ES Modules (ESM)
 */

export default {
  // Use node as test environment
  testEnvironment: 'node',

  // Transform files with babel-jest (for ESM)
  transform: {},

  // Module file extensions
  moduleFileExtensions: ['js', 'json'],

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'middleware/**/*.js',
    'controllers/**/*.js',
    'schemas/**/*.js',
    '!**/*.test.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Coverage thresholds (start conservative, increase gradually)
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30
    },
    './middleware/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],

  // Verbose output
  verbose: true,

  // Test timeout (increase for integration tests)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Module name mapper (if needed for aliases)
  moduleNameMapper: {},

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true
};
