/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';

export const postmortemActionItemSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  owner_user_id: uuidSchema.optional().nullable(),
  due_at: z.string().optional().nullable(),
  problem_id: uuidSchema.optional().nullable(),
  change_id: uuidSchema.optional().nullable(),
  improvement_id: uuidSchema.optional().nullable(),
});

export const postmortemActionItemCreateSchema = z.object({
  title: z.string().min(1).max(500),
});

export const postmortemFollowUpSchema = z.object({
  kind: z.enum(['problem', 'change']),
  assignment_group_id: uuidSchema,
  change_type_id: uuidSchema.optional(),
});

export const createMajorIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.union([z.literal(1), z.literal(2)]).default(1),
  impact: z.enum(['low', 'medium', 'high']).default('high'),
  urgency: z.enum(['low', 'medium', 'high']).default('high'),
  affected_service_ids: z.array(uuidSchema).default([]),
  assigned_team_id: uuidSchema.optional().nullable(),
  primary_incident_id: uuidSchema.optional().nullable(),
  war_room_channel: z.string().max(1000).optional().nullable(),
});

export const updateMajorIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional().nullable(),
  war_room_channel: z.string().max(1000).optional().nullable(),
});

export const majorIncidentStakeholderUpdateSchema = z.object({
  audience: z.enum(['internal', 'external']).default('external'),
  subject: z.string().max(500).optional().default(''),
  body: z.string().min(1).max(20000),
});

export const majorIncidentRoleSchema = z.object({
  role: z.enum(['commander', 'comms_lead', 'scribe', 'resolver']),
  user_id: uuidSchema,
});

export const majorIncidentRelatedSchema = z.object({
  incident_id: uuidSchema,
  link_reason: z.string().max(500).optional(),
});

export const majorIncidentResolveSchema = z.object({
  solution: z.string().min(1).max(20000),
});

export const postmortemUpsertSchema = z.object({
  timeline: z.array(z.record(z.string(), z.unknown())).optional(),
  root_causes: z.array(z.string()).optional(),
  contributing_factors: z.array(z.string()).optional(),
  action_items: z.array(postmortemActionItemSchema).optional(),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});

export const publishPostmortemSchema = z.object({
  root_causes: z.array(z.string().min(3)).min(1),
  contributing_factors: z.array(z.string().min(3)).min(1),
});

export const majorIncidentListQuerySchema = paginationSchema.extend({
  status: z.string().max(200).optional(),
  status_not_in: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum(['declared_major_at', 'title', 'status', 'priority', 'number']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  priority_lte: z.coerce.number().int().min(1).max(2).optional(),
});

export type CreateMajorIncidentInput = z.input<typeof createMajorIncidentSchema>;
export type UpdateMajorIncidentInput = z.input<typeof updateMajorIncidentSchema>;
export type MajorIncidentStakeholderUpdateInput = z.input<typeof majorIncidentStakeholderUpdateSchema>;
export type MajorIncidentRoleInput = z.input<typeof majorIncidentRoleSchema>;
export type MajorIncidentRelatedInput = z.input<typeof majorIncidentRelatedSchema>;
export type MajorIncidentResolveInput = z.input<typeof majorIncidentResolveSchema>;
export type PostmortemActionItemCreateInput = z.input<typeof postmortemActionItemCreateSchema>;
export type PostmortemFollowUpInput = z.input<typeof postmortemFollowUpSchema>;
export type PostmortemUpsertInput = z.input<typeof postmortemUpsertSchema>;
export type PublishPostmortemInput = z.input<typeof publishPostmortemSchema>;

export type CreateMajorIncident = z.output<typeof createMajorIncidentSchema>;
export type UpdateMajorIncident = z.output<typeof updateMajorIncidentSchema>;
