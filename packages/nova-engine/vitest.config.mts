/* SPDX-License-Identifier: AGPL-3.0-only */
import { defineConfig } from 'vitest/config';

const integration = process.env.NOVA_INTEGRATION === '1';

export default defineConfig({
  test: {
    include: integration
      ? ['src/integration/**/*.integration.test.ts']
      : ['src/**/*.test.ts'],
    exclude: integration
      ? []
      : ['src/integration/**', '**/node_modules/**', '**/dist/**'],
  },
});
