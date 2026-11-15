/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

const changeFailureCategorySchema = z.enum([
  'incomplete',
  'caused_incident',
  'rolled_back',
  'exceeded_window',
  'other',
]);

export const createChangeSchema = z.object({
  change_type_id: uuidSchema,
  standard_change_id: uuidSchema.nullable().optional(),
  category: z.string().max(100).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  reason_for_change: z.string().max(10000).optional(),
  stage: z.enum(['request', 'assessment', 'approval', 'planning', 'implementation', 'review']).optional(),
  status: z.enum([
    'draft',
    'assessment',
    'pending_approval',
    'approved',
    'rejected',
    'planning',
    'scheduled',
    'implementing',
    'implemented',
    'reviewing',
    'closed',
    'cancelled',
  ]).optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'very_high']).default('medium'),
  impact: z.string().max(20).default('medium'),
  impact_description: z.string().max(10000).optional(),
  implementation_plan: z.string().max(20000).optional(),
  backout_plan: z.string().max(20000).optional(),
  test_plan: z.string().max(20000).optional(),
  requested_by: uuidSchema.optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema,
  service_id: uuidSchema.nullable().optional(),
  affected_cis: z.array(uuidSchema).default([]),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  actual_start: z.string().nullable().optional(),
  actual_end: z.string().nullable().optional(),
  downtime_required: z.boolean().optional(),
  maintenance_window: z.string().max(100).optional(),
  implementation_notes: z.string().max(10000).optional(),
  success: z.boolean().nullable().optional(),
  failure_category: changeFailureCategorySchema.nullable().optional(),
  planned_downtime_minutes: z.number().int().min(0).nullable().optional(),
  actual_downtime_minutes: z.number().int().min(0).nullable().optional(),
  related_problem_id: uuidSchema.nullable().optional(),
  related_incident_id: uuidSchema.nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  business_justification: z.string().max(10000).optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  review_notes: z.string().max(10000).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const updateChangeSchema = createChangeSchema.partial();

export const changeTransitionSchema = z.object({
  action: z.enum([
    'submit_assessment',
    'request_approval',
    'approve',
    'reject',
    'start_planning',
    'schedule',
    'start_implementation',
    'mark_implemented',
    'start_review',
    'close',
    'cancel',
  ]),
  notes: z.string().max(5000).optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  override_blocking_conflicts: z.boolean().optional(),
  success: z.boolean().optional(),
  failure_category: changeFailureCategorySchema.nullable().optional(),
  planned_downtime_minutes: z.number().int().min(0).nullable().optional(),
  actual_downtime_minutes: z.number().int().min(0).nullable().optional(),
  review_notes: z.string().max(10000).nullable().optional(),
});

export const changeApprovalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'waived']),
  notes: z.string().max(5000).optional(),
});

export const createChangeTypeSchema = z.object({
  name: z.enum(['standard', 'normal', 'emergency']).or(z.string().min(1).max(100)),
  description: z.string().max(2000).optional(),
  requires_cab_approval: z.boolean().optional(),
  requires_manager_approval: z.boolean().optional(),
  auto_approve: z.boolean().optional(),
  default_risk_level: z.enum(['low', 'medium', 'high', 'very_high']).optional(),
  max_implementation_hours: z.number().int().positive().optional(),
  approval_config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

export const updateChangeTypeSchema = createChangeTypeSchema.partial();

export const createCabMeetingSchema = z.object({
  title: z.string().min(1).max(255),
  scheduled_at: z.string(),
  duration_min: z.number().int().min(15).max(480).default(60),
  minutes: z.string().max(20000).optional(),
});

export const createBlackoutSchema = z.object({
  name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().max(2000).optional(),
});

export const updateBlackoutSchema = createBlackoutSchema.partial();

export const createChangeRiskQuestionSchema = z.object({
  prompt: z.string().min(1).max(2000),
  weight: z.number().positive().max(100).default(1),
  sort_order: z.number().int().min(0).max(100000).default(0),
  is_active: z.boolean().optional().default(true),
});

export const updateChangeRiskQuestionSchema = createChangeRiskQuestionSchema.partial();

export const submitChangeRiskAssessmentSchema = z.object({
  answers: z.array(z.object({
    question_id: uuidSchema,
    score: z.number().int().min(0).max(5),
    answer_text: z.string().max(2000).optional().nullable(),
  })).min(1),
  apply_suggested_risk_level: z.boolean().optional().default(true),
});

export const addChangeJournalEntrySchema = z.object({
  entry_type: z.enum(['comment', 'work_note', 'state_change', 'assignment']).default('comment'),
  content: z.string().min(1).max(10000),
  is_customer_visible: z.boolean().default(false),
});

export type CreateChangeInput = z.input<typeof createChangeSchema>;
export type UpdateChangeInput = z.input<typeof updateChangeSchema>;
export type ChangeTransitionInput = z.input<typeof changeTransitionSchema>;
export type ChangeApprovalDecisionInput = z.input<typeof changeApprovalDecisionSchema>;
export type CreateChangeTypeInput = z.input<typeof createChangeTypeSchema>;
export type UpdateChangeTypeInput = z.input<typeof updateChangeTypeSchema>;
export type CreateCabMeetingInput = z.input<typeof createCabMeetingSchema>;
export type CreateBlackoutInput = z.input<typeof createBlackoutSchema>;
export type UpdateBlackoutInput = z.input<typeof updateBlackoutSchema>;
export type CreateChangeRiskQuestionInput = z.input<typeof createChangeRiskQuestionSchema>;
export type UpdateChangeRiskQuestionInput = z.input<typeof updateChangeRiskQuestionSchema>;
export type SubmitChangeRiskAssessmentInput = z.input<typeof submitChangeRiskAssessmentSchema>;
export type AddChangeJournalEntryInput = z.input<typeof addChangeJournalEntrySchema>;

export type CreateChange = z.output<typeof createChangeSchema>;
export type UpdateChange = z.output<typeof updateChangeSchema>;
export type ChangeTransition = z.output<typeof changeTransitionSchema>;
export type AddChangeJournalEntry = z.output<typeof addChangeJournalEntrySchema>;
