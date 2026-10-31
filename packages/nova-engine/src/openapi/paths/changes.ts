/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  changeApprovalDecisionSchema,
  changeTransitionSchema,
  createBlackoutSchema,
  createCabMeetingSchema,
  createChangeRiskQuestionSchema,
  createChangeSchema,
  createChangeTypeSchema,
  paginationSchema,
  submitChangeRiskAssessmentSchema,
  updateBlackoutSchema,
  updateChangeRiskQuestionSchema,
  updateChangeSchema,
  updateChangeTypeSchema,
  uuidSchema,
} from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const cabChangeParams = z.object({ id: uuidSchema, changeId: uuidSchema });
const approvalParams = z.object({ id: uuidSchema, approvalId: uuidSchema });

const standardTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  change_type_id: uuidSchema.optional(),
  is_active: z.boolean().optional(),
}).loose();

const cabAgendaDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'deferred']).or(z.string()),
  notes: z.string().max(5000).optional(),
}).loose();

export function registerChangePaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/changes/assignment-groups', 'Changes', 'List assignment groups for changes', {
    200: { description: 'Assignment groups' },
  });

  registerOp(registry, 'get', '/changes/types', 'Changes', 'List change types', {
    200: { description: 'Change types' },
  });

  registerOp(registry, 'post', '/changes/types', 'Changes', 'Create change type', {
    201: { description: 'Type created' },
  }, jsonBody(createChangeTypeSchema));

  registerOp(registry, 'patch', '/changes/types/{id}', 'Changes', 'Update change type', {
    200: { description: 'Type updated' },
  }, { params: uuidParam, ...jsonBody(updateChangeTypeSchema) });

  registerOp(registry, 'get', '/changes/standard-templates', 'Changes', 'List standard change templates', {
    200: { description: 'Templates' },
  });

  registerOp(registry, 'post', '/changes/standard-templates', 'Changes', 'Create standard change template', {
    201: { description: 'Template created' },
  }, jsonBody(standardTemplateSchema));

  registerOp(registry, 'patch', '/changes/standard-templates/{id}', 'Changes', 'Update standard change template', {
    200: { description: 'Template updated' },
  }, { params: uuidParam, ...jsonBody(standardTemplateSchema.partial()) });

  registerOp(registry, 'get', '/changes/cab-meetings', 'Changes', 'List CAB meetings', {
    200: { description: 'CAB meetings' },
  });

  registerOp(registry, 'post', '/changes/cab-meetings', 'Changes', 'Create CAB meeting', {
    201: { description: 'Meeting created' },
  }, jsonBody(createCabMeetingSchema));

  registerOp(registry, 'post', '/changes/cab-meetings/{id}/changes/{changeId}', 'Changes', 'Add change to CAB agenda', {
    200: { description: 'Added to agenda' },
  }, { params: cabChangeParams });

  registerOp(registry, 'patch', '/changes/cab-meetings/{id}/changes/{changeId}', 'Changes', 'Record CAB decision for a change', {
    200: { description: 'Decision recorded' },
  }, { params: cabChangeParams, ...jsonBody(cabAgendaDecisionSchema) });

  registerOp(registry, 'get', '/changes/blackouts', 'Changes', 'List change blackout windows', {
    200: { description: 'Blackouts' },
  });

  registerOp(registry, 'post', '/changes/blackouts', 'Changes', 'Create blackout window', {
    201: { description: 'Blackout created' },
  }, jsonBody(createBlackoutSchema));

  registerOp(registry, 'patch', '/changes/blackouts/{id}', 'Changes', 'Update blackout window', {
    200: { description: 'Blackout updated' },
  }, { params: uuidParam, ...jsonBody(updateBlackoutSchema) });

  registerOp(registry, 'get', '/changes/risk-questions', 'Changes', 'List change risk questions', {
    200: { description: 'Risk questions' },
  });

  registerOp(registry, 'post', '/changes/risk-questions', 'Changes', 'Create risk question', {
    201: { description: 'Question created' },
  }, jsonBody(createChangeRiskQuestionSchema));

  registerOp(registry, 'patch', '/changes/risk-questions/{id}', 'Changes', 'Update risk question', {
    200: { description: 'Question updated' },
  }, { params: uuidParam, ...jsonBody(updateChangeRiskQuestionSchema) });

  registerOp(registry, 'delete', '/changes/risk-questions/{id}', 'Changes', 'Delete risk question', {
    200: { description: 'Question deleted' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/changes/calendar', 'Changes', 'Change calendar view', {
    200: { description: 'Scheduled changes' },
  });

  registerOp(registry, 'get', '/changes/conflicts/{id}', 'Changes', 'Detect schedule conflicts for a change', {
    200: { description: 'Conflicts' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/changes', 'Changes', 'List changes', {
    200: { description: 'Paginated changes' },
  }, { query: paginationSchema });

  registerOp(registry, 'get', '/changes/stats', 'Changes', 'Change dashboard stats', {
    200: { description: 'Stats' },
  });

  registerOp(registry, 'get', '/changes/nav', 'Changes', 'Change list prev/next navigation', {
    200: { description: 'Adjacent change ids' },
  });

  registerOp(registry, 'post', '/changes', 'Changes', 'Create a change', {
    201: { description: 'Change created' },
  }, jsonBody(createChangeSchema));

  registerOp(registry, 'get', '/changes/{id}', 'Changes', 'Get change details', {
    200: { description: 'Change details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/changes/{id}', 'Changes', 'Update a change', {
    200: { description: 'Change updated' },
  }, { params: uuidParam, ...jsonBody(updateChangeSchema) });

  registerOp(registry, 'get', '/changes/{id}/risk-answers', 'Changes', 'Get risk assessment answers', {
    200: { description: 'Risk answers' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/changes/{id}/risk-assessment', 'Changes', 'Submit risk assessment', {
    200: { description: 'Assessment saved' },
  }, { params: uuidParam, ...jsonBody(submitChangeRiskAssessmentSchema) });

  registerOp(registry, 'post', '/changes/{id}/transition', 'Changes', 'Transition change lifecycle state', {
    200: { description: 'Transition applied' },
  }, { params: uuidParam, ...jsonBody(changeTransitionSchema) });

  registerOp(registry, 'post', '/changes/{id}/approvals/{approvalId}/decision', 'Changes', 'Record change approval decision', {
    200: { description: 'Decision recorded' },
  }, { params: approvalParams, ...jsonBody(changeApprovalDecisionSchema) });
}
