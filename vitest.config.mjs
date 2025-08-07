import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [],
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
        '**/*.test.ts',
        '**/*.spec.ts',
        'bin/**',
        'coverage/**',
        'dist/**',
        '.claude/**'
      ]
    },
    testTimeout: 20000,
    hookTimeout: 20000
  },
  resolve: {
    alias: {
      '@': '/src'
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs']
  },
  esbuild: {
    target: 'es2022',
    loader: 'ts'
  }
});