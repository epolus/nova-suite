/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const templateBody = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  locale: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
}).loose();

const templateCreateBody = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  locale: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
}).loose();

const signatureBody = z.object({
  body: z.string().nullable().optional(),
}).loose();

export function registerEmailTemplatePaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/admin/email-templates', 'Email templates', 'List email templates (admin)', {
    200: { description: 'Templates' },
    403: { description: 'Admin only' },
  }, { query: z.object({ include_inactive: z.string().optional() }).loose() });

  registerOp(registry, 'post', '/admin/email-templates', 'Email templates', 'Create email template', {
    201: { description: 'Created' },
  }, jsonBody(templateCreateBody));

  registerOp(registry, 'patch', '/admin/email-templates/{id}', 'Email templates', 'Update email template', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(templateBody) });

  registerOp(registry, 'delete', '/admin/email-templates/{id}', 'Email templates', 'Delete email template', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/email-templates', 'Email templates', 'List active email templates for agents', {
    200: { description: 'Templates' },
  }, { query: z.object({ locale: z.string().optional() }).loose() });

  registerOp(registry, 'get', '/email-signatures/me', 'Email templates', 'Get current user email signature', {
    200: { description: 'Signature' },
  });

  registerOp(registry, 'put', '/email-signatures/me', 'Email templates', 'Update current user email signature', {
    200: { description: 'Updated' },
  }, jsonBody(signatureBody));
}
