/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

export const createProblemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  category: z.string().max(100).optional(),
  status: z.enum([
    'new',
    'investigating',
    'root_cause_identified',
    'fix_in_progress',
    'resolved',
    'closed',
    'known_error',
  ]).optional(),
  root_cause: z.string().max(10000).optional(),
  symptoms: z.string().max(10000).optional(),
  workaround: z.string().max(10000).optional(),
  permanent_fix: z.string().max(10000).optional(),
  reported_by: uuidSchema.optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema,
  affected_ci: uuidSchema.nullable().optional(),
  resolution_notes: z.string().max(10000).optional(),
});

export const updateProblemSchema = createProblemSchema.partial();

export type CreateProblemInput = z.input<typeof createProblemSchema>;
export type UpdateProblemInput = z.input<typeof updateProblemSchema>;

export type CreateProblem = z.output<typeof createProblemSchema>;
export type UpdateProblem = z.output<typeof updateProblemSchema>;
