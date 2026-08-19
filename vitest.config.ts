import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A bounded worker pool avoids saturating Windows/OneDrive with concurrent
    // route imports. The same limits apply in CI so timing behavior stays close.
    maxWorkers: 4,
    testTimeout: 120_000,
    // The embedded Postgres suite is intentionally isolated from fast unit
    // tests so its WASM startup cannot cause unrelated 5s smoke timeouts.
    exclude: ['tests/database/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/styles/**',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/components/**/*.tsx',
      ],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 45,
        statements: 55,
      },
    },
  },
});
