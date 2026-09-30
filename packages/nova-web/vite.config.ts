/* SPDX-License-Identifier: AGPL-3.0-only */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  envDir: repoRoot,
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src'),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Cloudflare WAF on demo.nova-suite.io blocks GET /assets/Card-*.js and
        // /assets/content-panel-*.js (literal hyphens); percent-encoded paths
        // work. Keep chunk names on the known-safe ui-panel-* pattern.
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.endsWith('/components/Card.tsx') ||
            normalized.endsWith('/components/ui/card.tsx')
          ) {
            return 'ui-panel';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
