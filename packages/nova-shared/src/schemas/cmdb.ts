/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

export const createCIClassSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z_]+$/, 'Must be lowercase with underscores only'),
  display_name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parent_class: uuidSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  icon: z.string().max(50).optional(),
  is_active: z.boolean().optional().default(true),
});

export const updateCIClassSchema = createCIClassSchema.partial();

export const createCISchema = z.object({
  class_id: uuidSchema,
  name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional().nullable(),
  status: z.enum(['installed', 'in_stock', 'maintenance', 'retired', 'planned']).default('installed'),
  environment: z.enum(['production', 'staging', 'development', 'test']).default('production'),
  attributes: z.record(z.string(), z.unknown()).default({}),
  managed_by: uuidSchema.optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  supported_by: uuidSchema.optional().nullable(),
  location_id: uuidSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  external_id_1: z.string().max(255).optional().nullable(),
  external_id_2: z.string().max(255).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export const updateCISchema = createCISchema.partial();

export const createCIRelationshipSchema = z.object({
  source_ci_id: uuidSchema,
  target_ci_id: uuidSchema,
  relationship_type: z.enum([
    'depends_on',
    'used_by',
    'runs_on',
    'connected_to',
    'part_of',
    'manages',
  ]),
  notes: z.string().max(2000).optional(),
});

export type CreateCIClassInput = z.input<typeof createCIClassSchema>;
export type UpdateCIClassInput = z.input<typeof updateCIClassSchema>;
export type CreateCIInput = z.input<typeof createCISchema>;
export type UpdateCIInput = z.input<typeof updateCISchema>;
export type CreateCIRelationshipInput = z.input<typeof createCIRelationshipSchema>;

export type CreateCIClass = z.output<typeof createCIClassSchema>;
export type CreateCI = z.output<typeof createCISchema>;
export type CreateCIRelationship = z.output<typeof createCIRelationshipSchema>;
