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
      branches: 25,
      functions: 22,
      lines: 30,
      statements: 30
    }
  },
  testTimeout: 10000,
  verbose: true
};

