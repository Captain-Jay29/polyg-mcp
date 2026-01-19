import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests with forks to isolate integration tests
    pool: 'forks',
    poolOptions: {
      forks: {
        // Run FalkorDB integration tests in isolation
        singleFork: true,
      },
    },
    // Increase timeout for integration tests that connect to FalkorDB
    testTimeout: 30000,
    hookTimeout: 30000,
    // Ensure proper cleanup between tests
    sequence: {
      // Run test files sequentially to avoid FalkorDB connection race conditions
      concurrent: false,
    },
  },
});
