/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp } from '../helpers';

const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string().max(2000)),
});

export function registerSettingsPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/settings/theme', 'Settings', 'Public theme settings for the login page', {
    200: { description: 'Theme key/value map' },
  }, undefined, { security: [] });

  registerOp(registry, 'get', '/settings/logo', 'Settings', 'Public tenant logo image', {
    200: { description: 'Image bytes' },
    204: { description: 'No logo configured' },
  }, undefined, { security: [] });

  registerOp(registry, 'get', '/settings', 'Settings', 'List all tenant settings (admin)', {
    200: { description: 'Settings map' },
    403: { description: 'Admin only' },
  });

  registerOp(registry, 'put', '/settings', 'Settings', 'Update writable tenant settings (admin)', {
    200: { description: 'Updated settings' },
    400: { description: 'Unsupported keys' },
    403: { description: 'Admin only' },
  }, jsonBody(updateSettingsSchema));

  registerOp(registry, 'get', '/settings/cache/metrics', 'Settings', 'Cache health/usage counters (admin)', {
    200: { description: 'Cache metrics' },
    403: { description: 'Admin only' },
  });

  registerOp(registry, 'post', '/settings/cache/metrics/reset', 'Settings', 'Reset in-memory cache counters (admin)', {
    200: { description: 'Counters reset' },
    403: { description: 'Admin only' },
  });

  registerOp(registry, 'post', '/settings/logo', 'Settings', 'Upload tenant logo (admin)', {
    200: { description: 'Logo stored' },
    400: { description: 'Invalid upload' },
    403: { description: 'Admin only' },
  }, {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            logo: z.string().openapi({ format: 'binary' }),
          }),
        },
      },
      required: true,
    },
  });

  registerOp(registry, 'delete', '/settings/logo', 'Settings', 'Remove tenant logo (admin)', {
    200: { description: 'Logo removed' },
    403: { description: 'Admin only' },
  });
}
