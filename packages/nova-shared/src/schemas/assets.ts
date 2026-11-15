/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

const assetCategorySchema = z.enum(['hardware', 'software', 'license', 'consumable']);
const assetStatusSchema = z.enum([
  'ordered',
  'received',
  'in_stock',
  'in_use',
  'maintenance',
  'retired',
  'disposed',
]);

export const createAssetSchema = z.object({
  asset_tag: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  category: assetCategorySchema.optional(),
  status: assetStatusSchema.optional(),
  owner_user_id: uuidSchema.nullable().optional(),
  linked_ci_id: uuidSchema.nullable().optional(),
  vendor_name: z.string().max(255).nullable().optional(),
  purchase_cost: z.number().nullable().optional(),
  purchase_currency: z.string().max(8).nullable().optional(),
  purchase_date: z.string().max(32).nullable().optional(),
  warranty_expires_at: z.string().max(32).nullable().optional(),
  contract_ref: z.string().max(255).nullable().optional(),
  depreciation_months: z.number().int().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  external_id_1: z.string().max(255).nullable().optional(),
  external_id_2: z.string().max(255).nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const assignAssetSchema = z.object({
  user_id: uuidSchema,
  notes: z.string().max(5000).nullable().optional(),
});

export const returnAssetSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateAssetInput = z.input<typeof createAssetSchema>;
export type UpdateAssetInput = z.input<typeof updateAssetSchema>;
export type AssignAssetInput = z.input<typeof assignAssetSchema>;
export type ReturnAssetInput = z.input<typeof returnAssetSchema>;

export type CreateAsset = z.output<typeof createAssetSchema>;
export type UpdateAsset = z.output<typeof updateAssetSchema>;
