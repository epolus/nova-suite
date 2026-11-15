/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

export const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  assigned_to: uuidSchema.optional(),
  assignment_group_id: uuidSchema.optional(),
  caller_id: uuidSchema.optional(),
  contact_info: z.string().max(1000).optional(),
  service_id: uuidSchema.optional(),
  configuration_item_id: uuidSchema.optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  category_id: uuidSchema.optional(),
  request_id: uuidSchema.optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z
    .enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'])
    .optional(),
  impact: z.enum(['low', 'medium', 'high']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  caller_id: uuidSchema.nullable().optional(),
  contact_info: z.string().max(1000).nullable().optional(),
  service_id: uuidSchema.nullable().optional(),
  configuration_item_id: uuidSchema.nullable().optional(),
  category: z.string().max(255).nullable().optional(),
  subcategory: z.string().max(255).nullable().optional(),
  category_id: uuidSchema.nullable().optional(),
  closure_category_id: uuidSchema.nullable().optional(),
  resolution_code: z.string().max(255).nullable().optional(),
  resolution_code_id: uuidSchema.nullable().optional(),
  pending_reason: z.string().max(255).nullable().optional(),
  resolution_notes: z.string().max(10000).nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const incidentLinkMajorIncidentSchema = z.object({
  major_incident_id: uuidSchema,
});

export const addJournalEntrySchema = z.object({
  entry_type: z.enum(['comment', 'work_note', 'state_change', 'assignment']).default('comment'),
  content: z.string().min(1).max(10000),
  is_customer_visible: z.boolean().default(true),
});

/** Request body before parse (`z.input`) — defaults remain optional for clients. */
export type CreateIncidentInput = z.input<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.input<typeof updateIncidentSchema>;
export type IncidentLinkMajorIncidentInput = z.input<typeof incidentLinkMajorIncidentSchema>;
export type AddJournalEntryInput = z.input<typeof addJournalEntrySchema>;

/** Parsed body after Zod validation (`z.output`). */
export type CreateIncident = z.output<typeof createIncidentSchema>;
export type UpdateIncident = z.output<typeof updateIncidentSchema>;
export type AddJournalEntry = z.output<typeof addJournalEntrySchema>;
