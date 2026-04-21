#!/usr/bin/env node

const { spawnSync } = require('child_process');

const jestArgs = [
  '--runInBand',
  'server/__tests__/api.integration.test.js',
  'server/__tests__/multi-tenant.integration.test.js',
  'server/__tests__/security.integration.test.js',
  'server/__tests__/health-routes.test.js'
];

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', ...jestArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REQUIRE_SOCKET_TESTS: 'true'
    }
  }
);

process.exit(result.status ?? 1);
