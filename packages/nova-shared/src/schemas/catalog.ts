/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { fulfillmentModelConfigErrors } from '../fulfillment-model';
import { uuidSchema } from './common';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const createServiceItemSchema = z.object({
  category_id: uuidSchema,
  name: z.string().min(1).max(255),
  short_description: z.string().max(500).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  icon: z.string().max(50).optional(),
  price: z.number().min(0).optional().nullable(),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
  form_schema: z
    .object({ fields: z.array(z.record(z.string(), z.unknown())) })
    .default({ fields: [] }),
  approval_required: z.boolean().default(false),
  sla_hours: z.number().int().min(1).optional(),
  fulfillment_model_id: uuidSchema.nullable().optional(),
});

export const updateServiceItemSchema = createServiceItemSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const fulfillmentModelWriteSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  config: z.unknown(),
}).superRefine((body, ctx) => {
  const errors = fulfillmentModelConfigErrors(body.config);
  if (errors.length > 0) {
    ctx.addIssue({ code: 'custom', message: errors.join('; '), path: ['config'] });
  }
});

export const fulfillmentModelUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  config: z.unknown().optional(),
}).superRefine((body, ctx) => {
  if (body.config === undefined) return;
  const errors = fulfillmentModelConfigErrors(body.config);
  if (errors.length > 0) {
    ctx.addIssue({ code: 'custom', message: errors.join('; '), path: ['config'] });
  }
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CreateServiceItemInput = z.input<typeof createServiceItemSchema>;
export type UpdateServiceItemInput = z.input<typeof updateServiceItemSchema>;
export type FulfillmentModelWriteInput = z.input<typeof fulfillmentModelWriteSchema>;
export type FulfillmentModelUpdateInput = z.input<typeof fulfillmentModelUpdateSchema>;

export type CreateCategory = z.output<typeof createCategorySchema>;
export type CreateServiceItem = z.output<typeof createServiceItemSchema>;
export type FulfillmentModelWrite = z.output<typeof fulfillmentModelWriteSchema>;
