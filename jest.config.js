module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/**/__tests__/**',
    '!server/index.js',
    '!server/metrics.js'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 21,
      functions: 20,
      lines: 30,
      statements: 30
    }
  },
  testTimeout: 10000,
  verbose: true
};

