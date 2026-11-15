/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

const requestPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const deliveryInfoSchema = z.object({
  location: z.string().max(500).optional(),
  date_needed: z.string().optional(),
  instructions: z.string().max(2000).optional(),
}).default({});

export const createRequestSchema = z.object({
  service_item_id: uuidSchema,
  form_data: z.record(z.string(), z.unknown()).default({}),
  priority: requestPrioritySchema.default('medium'),
  notes: z.string().max(5000).optional(),
  requested_for: uuidSchema.optional(),
  delivery_info: deliveryInfoSchema,
  batch_id: uuidSchema.optional(),
});

export const batchRequestSchema = z.object({
  items: z.array(z.object({
    service_item_id: uuidSchema,
    form_data: z.record(z.string(), z.unknown()).default({}),
    priority: requestPrioritySchema.default('medium'),
    notes: z.string().max(5000).optional(),
  })).min(1).max(50),
  requested_for: uuidSchema.optional(),
  delivery_info: deliveryInfoSchema,
});

export const approveRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(2000).optional(),
});

export type CreateRequestInput = z.input<typeof createRequestSchema>;
export type BatchRequestInput = z.input<typeof batchRequestSchema>;
export type ApproveRequestInput = z.input<typeof approveRequestSchema>;

export type CreateRequest = z.output<typeof createRequestSchema>;
export type BatchRequest = z.output<typeof batchRequestSchema>;
export type ApproveRequest = z.output<typeof approveRequestSchema>;
