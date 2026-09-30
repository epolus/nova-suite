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
        // Avoid /assets/Card-*.js chunk names: Cloudflare has repeatedly served
        // poisoned 404/502 responses for that pattern on demo. Keep both card
        // modules on the stable ui-panel-* name instead.
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
