import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Only include source files
      include: ['src/**/*.ts'],
      exclude: [
        // CLI entry point - tested via integration tests
        'src/main.ts',
        // Test files
        'src/**/*.test.ts',
      ],
    },
  },
});
