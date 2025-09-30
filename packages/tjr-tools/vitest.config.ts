import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.config.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@tjr/contracts': path.resolve(__dirname, '../contracts/dist')
    }
  }
});