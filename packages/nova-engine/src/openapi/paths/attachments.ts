/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { registerOp, uuidParam } from '../helpers';

const entityQuery = z.object({
  entity_type: z.string().min(1),
  entity_id: uuidSchema,
});

export function registerAttachmentPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/attachments', 'Attachments', 'List attachments for an entity', {
    200: { description: 'Attachment list' },
    400: { description: 'entity_type and entity_id required' },
  }, { query: entityQuery });

  registerOp(registry, 'post', '/attachments/upload', 'Attachments', 'Upload an attachment', {
    201: { description: 'Attachment created' },
    400: { description: 'Missing file or entity fields' },
  }, {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary' }),
            entity_type: z.string().min(1),
            entity_id: uuidSchema,
          }),
        },
      },
      required: true,
    },
  });

  registerOp(registry, 'get', '/attachments/{id}/download', 'Attachments', 'Download an attachment', {
    200: { description: 'File bytes' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'delete', '/attachments/{id}', 'Attachments', 'Delete an attachment', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
