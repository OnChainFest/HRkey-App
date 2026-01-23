module.exports = {
  collectCoverageFrom: [
    'backend/**/*.{js,ts}',
    'HRkey/src/**/*.{ts,tsx}',
    '!**/*.test.*',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 1,
      functions: 1,
      lines: 1,
      statements: 1
    }
  },
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      roots: ['<rootDir>/backend'],
      testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/backend/__tests__/setup.ts'],
      moduleNameMapper: { '^winston$': '<rootDir>/backend/__tests__/mocks/winston.js' },
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.[tj]s$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: {
              allowJs: true,
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Bundler'
            }
          }
        ]
      }
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/HRkey/src'],
      testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.jsx'],
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
            tsconfig: {
              jsx: 'react-jsx',
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Bundler'
            }
          }
        ]
      }
    }
  ]
};
