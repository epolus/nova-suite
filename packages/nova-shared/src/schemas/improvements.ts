/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

const improvementStatusSchema = z.enum(['registered', 'in_progress', 'done', 'cancelled']);

export const createImprovementSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
});

export const updateImprovementSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: improvementStatusSchema.optional(),
  owner_user_id: uuidSchema.nullable().optional(),
});

export const improvementFromPostmortemSchema = z.object({
  major_incident_id: uuidSchema,
  action_item_id: uuidSchema,
});

export const improvementFromChangeSchema = z.object({
  change_id: uuidSchema,
});

export const improvementFromProblemSchema = z.object({
  problem_id: uuidSchema,
});

export const addImprovementJournalSchema = z.object({
  entry_type: z.enum(['comment', 'work_note']).default('comment'),
  content: z.string().min(1).max(10000),
});

export type CreateImprovementInput = z.input<typeof createImprovementSchema>;
export type UpdateImprovementInput = z.input<typeof updateImprovementSchema>;
export type ImprovementFromPostmortemInput = z.input<typeof improvementFromPostmortemSchema>;
export type ImprovementFromChangeInput = z.input<typeof improvementFromChangeSchema>;
export type ImprovementFromProblemInput = z.input<typeof improvementFromProblemSchema>;
export type AddImprovementJournalInput = z.input<typeof addImprovementJournalSchema>;

export type CreateImprovement = z.output<typeof createImprovementSchema>;
export type UpdateImprovement = z.output<typeof updateImprovementSchema>;
export type AddImprovementJournal = z.output<typeof addImprovementJournalSchema>;
