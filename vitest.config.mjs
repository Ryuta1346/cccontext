import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.mjs',
        '**/*.spec.mjs',
        'bin/**',
        'coverage/**',
        'dist/**',
        '.claude/**'
      ]
    },
    testTimeout: 20000,
    hookTimeout: 20000
  }
});