/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

const releaseStatusSchema = z.enum(['planned', 'in_progress', 'deployed', 'cancelled']);
const releaseTypeSchema = z.enum(['major', 'minor', 'emergency']);
const releaseRiskSchema = z.enum(['low', 'medium', 'high']);

export const createReleaseSchema = z.object({
  number: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: releaseStatusSchema.optional(),
  release_type: releaseTypeSchema.optional(),
  risk_level: releaseRiskSchema.optional(),
  planned_start: z.string().max(64).nullable().optional(),
  planned_end: z.string().max(64).nullable().optional(),
  deployed_at: z.string().max(64).nullable().optional(),
  owner_user_id: uuidSchema.nullable().optional(),
  change_id: uuidSchema.nullable().optional(),
  validation_notes: z.string().max(10000).nullable().optional(),
  rollback_plan: z.string().max(10000).nullable().optional(),
});

export const updateReleaseSchema = createReleaseSchema.partial();

export type CreateReleaseInput = z.input<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.input<typeof updateReleaseSchema>;

export type CreateRelease = z.output<typeof createReleaseSchema>;
export type UpdateRelease = z.output<typeof updateReleaseSchema>;
