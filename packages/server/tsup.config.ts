import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: false, // CLI doesn't need type definitions
  shims: true,
  // Keep heavy dependencies external - users install them
  external: ['falkordb', 'openai'],
  // Don't externalize workspace packages - bundle them
  noExternal: ['@polyg-mcp/core', '@polyg-mcp/shared'],
});
