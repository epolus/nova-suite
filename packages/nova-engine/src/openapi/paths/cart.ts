/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const cartItemSchema = z.object({
  service_item_id: uuidSchema,
  form_data: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  notes: z.string().optional(),
});

const cartItemPatchSchema = z.object({
  form_data: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  notes: z.string().optional(),
}).loose();

export function registerCartPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/cart', 'Cart', 'Get current user cart summary and items', {
    200: { description: 'Cart' },
  });

  registerOp(registry, 'post', '/cart/items', 'Cart', 'Add a catalog item to the cart', {
    201: { description: 'Item added' },
  }, jsonBody(cartItemSchema));

  registerOp(registry, 'patch', '/cart/items/{id}', 'Cart', 'Update a cart item', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(cartItemPatchSchema) });

  registerOp(registry, 'delete', '/cart/items/{id}', 'Cart', 'Remove a cart item', {
    200: { description: 'Removed' },
  }, { params: uuidParam });

  registerOp(registry, 'delete', '/cart', 'Cart', 'Clear the cart', {
    200: { description: 'Cleared' },
  });
}
