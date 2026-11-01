/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import {
  requestWorkflowAction,
  serviceItemFulfillmentIssue,
  type RequestFulfillmentIssue,
  type ServiceItemFulfillmentIssue,
} from '@nova-suite/shared';
import { BadRequest, NotFound } from '../../middleware/errorHandler';

const SAVE_MESSAGES: Record<ServiceItemFulfillmentIssue, string> = {
  model_and_tasks: 'A service item cannot use a fulfillment model and catalog tasks',
  inactive_model: 'Cannot activate a service item with an inactive fulfillment model',
  activate_requires_task: 'Cannot activate a service item without at least one active Catalog Workflow Task',
};

const ORDER_MESSAGES: Record<RequestFulfillmentIssue, string> = {
  inactive_model: 'The fulfillment model for this service item is inactive',
  model_and_tasks: 'This service item has both a fulfillment model and catalog tasks',
  model_not_found: 'Fulfillment model not found',
};

type FulfillmentRow = {
  fulfillment_model_id: string | null;
  model_found: boolean;
  model_active: boolean;
  catalog_task_count: number;
  active_catalog_task_count: number;
};

async function loadFulfillmentRow(client: PoolClient, serviceItemId: string): Promise<FulfillmentRow | null> {
  const result = await client.query<FulfillmentRow>(
    `SELECT si.fulfillment_model_id,
            (fm.id IS NOT NULL) AS model_found,
            COALESCE(fm.is_active, false) AS model_active,
            (SELECT count(*)::int FROM catalog_tasks ct WHERE ct.service_item_id = si.id) AS catalog_task_count,
            (SELECT count(*)::int FROM catalog_tasks ct
              WHERE ct.service_item_id = si.id AND ct.is_active = true) AS active_catalog_task_count
     FROM service_items si
     LEFT JOIN fulfillment_models fm ON fm.id = si.fulfillment_model_id
     WHERE si.id = $1`,
    [serviceItemId],
  );
  return result.rows[0] ?? null;
}

export async function assertServiceItemFulfillment(input: {
  client: PoolClient;
  serviceItemId: string | null;
  fulfillmentModelId: string | null;
  activating: boolean;
}): Promise<void> {
  let catalogTaskCount = 0;
  let activeCatalogTaskCount = 0;
  let modelFound = false;
  let modelActive = false;

  if (input.serviceItemId) {
    const row = await loadFulfillmentRow(input.client, input.serviceItemId);
    if (!row) throw NotFound('Service item not found');
    catalogTaskCount = row.catalog_task_count;
    activeCatalogTaskCount = row.active_catalog_task_count;
  }

  if (input.fulfillmentModelId) {
    const model = await input.client.query<{ is_active: boolean }>(
      `SELECT is_active FROM fulfillment_models WHERE id = $1`,
      [input.fulfillmentModelId],
    );
    if (model.rows.length === 0) throw BadRequest('Fulfillment model not found');
    modelFound = true;
    modelActive = model.rows[0].is_active === true;
  }

  const issue = serviceItemFulfillmentIssue({
    fulfillmentModelId: input.fulfillmentModelId,
    modelActive: modelFound && modelActive,
    catalogTaskCount,
    activeCatalogTaskCount,
    activating: input.activating,
  });
  if (issue) throw BadRequest(SAVE_MESSAGES[issue]);
}

export async function catalogWorkflowForItem(
  client: PoolClient,
  serviceItemId: string,
): Promise<'start' | 'legacy'> {
  const row = await loadFulfillmentRow(client, serviceItemId);
  if (!row) throw BadRequest('Service item not found');
  const decision = requestWorkflowAction({
    fulfillmentModelId: row.fulfillment_model_id,
    modelFound: row.model_found,
    modelActive: row.model_active,
    catalogTaskCount: row.catalog_task_count,
    activeCatalogTaskCount: row.active_catalog_task_count,
  });
  if (decision.issue) throw BadRequest(ORDER_MESSAGES[decision.issue]);
  return decision.action;
}

export async function assertItemHasNoFulfillmentModel(client: PoolClient, serviceItemId: string): Promise<void> {
  const row = await client.query<{ fulfillment_model_id: string | null }>(
    `SELECT fulfillment_model_id FROM service_items WHERE id = $1`,
    [serviceItemId],
  );
  if (row.rows.length === 0) throw NotFound('Service item not found');
  if (row.rows[0].fulfillment_model_id) {
    throw BadRequest('This service item uses a fulfillment model. Remove the model before adding catalog tasks.');
  }
}
