import { defineConfig } from 'vitest/config';

/**
 * Integration + e2e against real Anvil nodes (CI job `integration`). One file at a time: the
 * suites share the agent key, so they must not race on its nonce.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    passWithNoTests: false,
  },
});
