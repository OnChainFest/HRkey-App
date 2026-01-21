module.exports = {
  collectCoverageFrom: [
    'backend/**/*.{js,ts}',
    'HRkey/src/**/*.{ts,tsx}',
    '!**/*.test.*',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30
    }
  },
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      roots: ['<rootDir>/backend'],
      testMatch: ['**/__tests__/**/*.test.js', '**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/backend/__tests__/setup.ts'],
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.json'
          }
        ]
      }
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/HRkey/src'],
      testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.jsx', '**/__tests__/**/*.test.ts'],
      passWithNoTests: true,
      setupFilesAfterEnv: ['<rootDir>/HRkey/src/__tests__/setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/HRkey/src/$1'
      },
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      transform: {
        '^.+\\.(ts|tsx)$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/HRkey/tsconfig.json'
          }
        ]
      }
    }
  ]
};
