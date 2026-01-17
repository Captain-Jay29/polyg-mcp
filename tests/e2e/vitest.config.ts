import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scenarios/**/*.test.ts'],
    testTimeout: 120000, // 2 minutes per test (LLM calls can be slow)
    hookTimeout: 60000, // 1 minute for setup/teardown
    reporters: ['verbose'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run sequentially to avoid race conditions
      },
    },
  },
});
