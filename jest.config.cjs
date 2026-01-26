/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      roots: ['<rootDir>/backend'],
      testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.test.js',
      ],
      transform: {
        '^.+\\.(t|j)s$': ['ts-jest', { useESM: true }],
      },
      extensionsToTreatAsEsm: ['.ts'],
    },

    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/HRkey/src'],
      testMatch: [
        '**/__tests__/**/*.test.tsx',
        '**/__tests__/**/*.test.jsx',
        '**/__tests__/**/*.test.ts',
      ],
      transform: {
        '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['next/babel'] }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/HRkey/src/$1',
        '^\\.(css|less|sass|scss)$': 'identity-obj-proxy',
        '^.+\\.(png|jpg|jpeg|gif|webp|svg)$': '<rootDir>/backend/__tests__/mocks/fileMock.js',
      },
      setupFilesAfterEnv: ['<rootDir>/HRkey/src/__tests__/setup.ts'],
    },
  ],
};
