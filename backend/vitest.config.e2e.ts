import { defineConfig } from 'vitest/config';
import { loadEnvFile } from 'node:process';

loadEnvFile('.env');

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
