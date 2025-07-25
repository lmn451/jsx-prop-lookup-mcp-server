/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.d\\.ts$'
  ],
  transform: {
    '^.+\.(ts|tsx)$': 'babel-jest',
  },
  globalSetup: './jest-setup/setup-test-data.js',
  globalTeardown: './jest-setup/teardown-test-data.js',
};

export default config;
