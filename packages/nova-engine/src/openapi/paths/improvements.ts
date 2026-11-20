/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  addImprovementJournalSchema,
  createImprovementSchema,
  improvementFromChangeSchema,
  improvementFromPostmortemSchema,
  improvementFromProblemSchema,
  updateImprovementSchema,
  uuidSchema,
} from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const sourceQuery = z.object({
  source_type: z.string().optional(),
  source_id: uuidSchema.optional(),
  action_item_id: uuidSchema.optional(),
}).loose();

export function registerImprovementPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/improvements', 'Improvements', 'List improvements', {
    200: { description: 'Improvement list' },
  });

  registerOp(registry, 'get', '/improvements/source', 'Improvements', 'Find improvements by source record', {
    200: { description: 'Matching improvements' },
  }, { query: sourceQuery });

  registerOp(registry, 'post', '/improvements', 'Improvements', 'Create an improvement', {
    201: { description: 'Improvement created' },
  }, jsonBody(createImprovementSchema));

  registerOp(registry, 'post', '/improvements/from-postmortem', 'Improvements', 'Spawn improvement from a postmortem action item', {
    201: { description: 'Improvement created' },
  }, jsonBody(improvementFromPostmortemSchema));

  registerOp(registry, 'post', '/improvements/from-change', 'Improvements', 'Spawn improvement from a change', {
    201: { description: 'Improvement created' },
  }, jsonBody(improvementFromChangeSchema));

  registerOp(registry, 'post', '/improvements/from-problem', 'Improvements', 'Spawn improvement from a problem', {
    201: { description: 'Improvement created' },
  }, jsonBody(improvementFromProblemSchema));

  registerOp(registry, 'get', '/improvements/{id}', 'Improvements', 'Get improvement details', {
    200: { description: 'Improvement details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/improvements/{id}', 'Improvements', 'Update an improvement', {
    200: { description: 'Improvement updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateImprovementSchema) });

  registerOp(registry, 'get', '/improvements/{id}/journal', 'Improvements', 'List improvement journal entries', {
    200: { description: 'Journal entries' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/improvements/{id}/journal', 'Improvements', 'Add improvement journal entry', {
    201: { description: 'Journal entry created' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(addImprovementJournalSchema) });
}
