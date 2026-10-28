/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import {
  fieldsOf,
  snActionTypeSchema,
  snCatalogSchema,
  snCategorySchema,
  snCatItemSchema,
  snFlowInstanceSchema,
  snFlowSchema,
  snFlowVariableSchema,
  snGroupSchema,
  snLogicDefinitionSchema,
  snUserSchema,
  snQuestionChoiceSchema,
  snTriggerInstanceSchema,
  snVariableSchema,
  snVariableSetItemSchema,
  snVariableSetSchema,
  snVariableValueSchema,
  type SnFlowInstance,
} from '../raw-schemas';
import {
  SERVICENOW_SNAPSHOT_VERSION,
  serviceNowExtractOptionsSchema,
  type ServiceNowExtractOptions,
  type ServiceNowFlow,
  type ServiceNowSnapshot,
  type ServiceNowStep,
} from '../snapshot';
import { ServiceNowApiError, type ServiceNowClient } from './client';
import { decodeFlowValues } from './decode';

export type ServiceNowExtractProgress = (stage: string, detail?: Record<string, unknown>) => void | Promise<void>;

const MAX_FLOWS = 1000;

const INSTANCE_TABLES = {
  action: { v2: 'sys_hub_action_instance_v2', v1: 'sys_hub_action_instance' },
  logic: { v2: 'sys_hub_flow_logic_instance_v2', v1: 'sys_hub_flow_logic' },
  subflow: { v2: 'sys_hub_sub_flow_instance_v2', v1: 'sys_hub_sub_flow_instance' },
} as const;

type StepKind = keyof typeof INSTANCE_TABLES;

function parseRows<T extends z.ZodObject>(schema: T, rows: Array<Record<string, unknown>>): Array<z.infer<T>> {
  return z.array(schema).parse(rows);
}

export async function extractServiceNowSnapshot(
  client: ServiceNowClient,
  rawOptions: Partial<ServiceNowExtractOptions> = {},
  onProgress?: ServiceNowExtractProgress,
): Promise<ServiceNowSnapshot> {
  const options = serviceNowExtractOptionsSchema.parse(rawOptions);
  const warnings: string[] = [];
  const missingTables = new Set<string>();

  /** Lists a table, turning "table missing" and ACL errors into warnings. */
  async function safeListIn(
    table: string,
    field: string,
    ids: string[],
    fields: string,
    extraQuery?: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (ids.length === 0 || missingTables.has(table)) return [];
    try {
      return await client.listIn(table, field, ids, { fields, extraQuery });
    } catch (err) {
      if (err instanceof ServiceNowApiError && [400, 403, 404].includes(err.status)) {
        missingTables.add(table);
        warnings.push(
          err.status === 403
            ? `No read access to ${table} (check the integration user's ACLs).`
            : `Table ${table} is not available on this instance (${err.status}).`,
        );
        return [];
      }
      throw err;
    }
  }

  await onProgress?.('release');
  let release: string | null = null;
  try {
    const props = await client.list('sys_properties', {
      query: 'nameINglide.buildtag.last,glide.war',
      fields: 'name,value',
    });
    const tag = props.find((p) => p.name === 'glide.buildtag.last') ?? props[0];
    release = tag ? String(tag.value ?? '') || null : null;
  } catch {
    warnings.push('Could not read the instance release (sys_properties); continuing.');
  }

  await onProgress?.('catalogs');
  const catalogs = parseRows(
    snCatalogSchema,
    await client.list('sc_catalog', {
      query: options.catalogIds.length ? `sys_idIN${options.catalogIds.join(',')}` : undefined,
      fields: fieldsOf(snCatalogSchema),
    }),
  );
  const categoryQuery = [
    options.includeInactive ? '' : 'active=true',
    options.catalogIds.length ? `sc_catalogIN${options.catalogIds.join(',')}` : '',
  ].filter(Boolean).join('^');
  const categories = parseRows(
    snCategorySchema,
    await client.list('sc_category', { query: categoryQuery || undefined, fields: fieldsOf(snCategorySchema) }),
  );

  await onProgress?.('items');
  const excludedClasses = ['sc_cat_item_guide', 'sc_cat_item_content', 'sc_cat_item_wizard'];
  if (!options.includeRecordProducers) excludedClasses.push('sc_cat_item_producer');
  const itemQueryParts = [
    options.includeInactive ? '' : 'active=true',
    `sys_class_nameNOT IN${excludedClasses.join(',')}`,
  ];
  if (options.itemIds.length) itemQueryParts.push(`sys_idIN${options.itemIds.join(',')}`);
  else if (options.categoryIds.length) itemQueryParts.push(`categoryIN${options.categoryIds.join(',')}`);
  else if (options.catalogIds.length) {
    itemQueryParts.push(options.catalogIds.map((id) => `sc_catalogsLIKE${id}`).join('^OR'));
  }
  const items = parseRows(
    snCatItemSchema,
    await client.list('sc_cat_item', {
      query: `${itemQueryParts.filter(Boolean).join('^')}^ORDERBYorder`,
      fields: fieldsOf(snCatItemSchema),
      limit: options.maxItems,
    }),
  );
  if (items.length >= options.maxItems) {
    warnings.push(`Item limit reached (${options.maxItems}); narrow the selection to migrate the rest.`);
  }
  const itemIds = items.map((i) => i.sys_id);

  await onProgress?.('variables', { items: items.length });
  const variableSetItems = parseRows(
    snVariableSetItemSchema,
    await client.listIn('io_set_item', 'sc_cat_item', itemIds, { fields: fieldsOf(snVariableSetItemSchema) }),
  );
  const setIds = [...new Set(variableSetItems.map((l) => l.variable_set))];
  const variableSets = parseRows(
    snVariableSetSchema,
    await client.listIn('item_option_new_set', 'sys_id', setIds, { fields: fieldsOf(snVariableSetSchema) }),
  );
  const varFields = fieldsOf(snVariableSchema);
  const activeFilter = options.includeInactive ? undefined : 'active=true';
  const variables = parseRows(snVariableSchema, [
    ...(await client.listIn('item_option_new', 'cat_item', itemIds, { fields: varFields, extraQuery: activeFilter })),
    ...(await client.listIn('item_option_new', 'variable_set', setIds, { fields: varFields, extraQuery: activeFilter })),
  ]);
  const choices = parseRows(
    snQuestionChoiceSchema,
    await client.listIn('question_choice', 'question', variables.map((v) => v.sys_id), {
      fields: fieldsOf(snQuestionChoiceSchema),
    }),
  );

  await onProgress?.('flows');
  const flows: ServiceNowFlow[] = [];
  const seenFlows = new Set<string>();
  let queue = [...new Set(items.map((i) => i.flow_designer_flow).filter(Boolean))];
  for (const item of items) {
    if (item.workflow && !item.flow_designer_flow) {
      warnings.push(`Item "${item.name}" uses a legacy workflow (${item.workflow}); legacy workflows are not converted.`);
    }
  }

  while (queue.length > 0 && seenFlows.size < MAX_FLOWS) {
    const batch = queue.filter((id) => !seenFlows.has(id));
    queue = [];
    if (batch.length === 0) break;
    batch.forEach((id) => seenFlows.add(id));
    const flowRows = parseRows(
      snFlowSchema,
      await safeListIn('sys_hub_flow', 'sys_id', batch, fieldsOf(snFlowSchema)),
    );
    const found = new Set(flowRows.map((f) => f.sys_id));
    for (const id of batch) if (!found.has(id)) warnings.push(`Flow ${id} could not be read.`);

    const candidatesByFlow = new Map<string, string[]>();
    for (const f of flowRows) {
      candidatesByFlow.set(f.sys_id, [...new Set([f.master_snapshot, f.sys_id, f.latest_snapshot].filter(Boolean))]);
    }
    const candidateIds = [...candidatesByFlow.values()].flat();
    const instFields = fieldsOf(snFlowInstanceSchema);

    const rowsByVersion: Record<'v1' | 'v2', Record<StepKind, SnFlowInstance[]>> = {
      v1: { action: [], logic: [], subflow: [] },
      v2: { action: [], logic: [], subflow: [] },
    };
    for (const version of ['v2', 'v1'] as const) {
      for (const kind of Object.keys(INSTANCE_TABLES) as StepKind[]) {
        rowsByVersion[version][kind] = parseRows(
          snFlowInstanceSchema,
          await safeListIn(INSTANCE_TABLES[kind][version], 'flow', candidateIds, instFields),
        );
      }
    }

    const v1Ids = Object.values(rowsByVersion.v1).flat().map((r) => r.sys_id);
    const v1Values = new Map<string, Record<string, unknown>>();
    for (const row of parseRows(
      snVariableValueSchema,
      await safeListIn('sys_variable_value', 'document_key', v1Ids, 'document_key,value,variable.element'),
    )) {
      const rec = v1Values.get(row.document_key) ?? {};
      if (row['variable.element']) rec[row['variable.element']] = row.value;
      v1Values.set(row.document_key, rec);
    }

    const triggerFields = fieldsOf(snTriggerInstanceSchema);
    const triggers = parseRows(snTriggerInstanceSchema, [
      ...(await safeListIn('sys_hub_trigger_instance_v2', 'flow', candidateIds, triggerFields)),
      ...(await safeListIn('sys_hub_trigger_instance', 'flow', candidateIds, triggerFields)),
    ]);
    const flowVars = parseRows(
      snFlowVariableSchema,
      await safeListIn('sys_hub_flow_variable', 'model', candidateIds, fieldsOf(snFlowVariableSchema)),
    );

    let undecodable = 0;
    for (const f of flowRows) {
      const candidates = candidatesByFlow.get(f.sys_id) ?? [];
      let storage: ServiceNowFlow['storage'] = 'none';
      let sourceRecordId = f.sys_id;
      outer: for (const version of ['v2', 'v1'] as const) {
        for (const cand of candidates) {
          const any = (Object.keys(INSTANCE_TABLES) as StepKind[]).some((k) =>
            rowsByVersion[version][k].some((r) => r.flow === cand),
          );
          if (any) {
            storage = version;
            sourceRecordId = cand;
            break outer;
          }
        }
      }
      const steps: ServiceNowStep[] = [];
      if (storage !== 'none') {
        for (const kind of Object.keys(INSTANCE_TABLES) as StepKind[]) {
          for (const r of rowsByVersion[storage][kind]) {
            if (r.flow !== sourceRecordId) continue;
            let values: Record<string, unknown>;
            if (storage === 'v2') {
              const decoded = decodeFlowValues(r.values);
              if (decoded.encoding === 'unknown') undecodable += 1;
              values = decoded.values;
            } else {
              values = v1Values.get(r.sys_id) ?? {};
            }
            steps.push({
              kind,
              sysId: r.sys_id,
              uiId: r.ui_id || r.sys_id,
              parentUiId: r.parent_ui_id,
              order: r.order,
              comment: r.comment,
              definitionId: kind === 'action' ? r.action_type : kind === 'logic' ? r.logic_definition : '',
              subflowId: kind === 'subflow' ? r.subflow : '',
              values,
            });
            if (kind === 'subflow' && r.subflow && !seenFlows.has(r.subflow)) queue.push(r.subflow);
          }
        }
      } else {
        warnings.push(`Flow "${f.name}" has no readable steps.`);
      }
      steps.sort((a, b) => a.order - b.order);
      const trigger = triggers.find((t) => candidates.includes(t.flow));
      flows.push({
        ...f,
        storage,
        sourceRecordId,
        triggerName: trigger ? trigger['trigger_definition.name'] || trigger.trigger_type : '',
        steps,
        flowVariables: flowVars
          .filter((v) => v.model === sourceRecordId || v.model === f.sys_id)
          .map((v) => ({ name: v.element, label: v.label, type: v.internal_type })),
      });
    }
    if (undecodable > 0) warnings.push(`${undecodable} flow step value blobs could not be decoded.`);
    await onProgress?.('flows', { flows: flows.length });
  }
  if (queue.length > 0) warnings.push(`Flow limit reached (${MAX_FLOWS}); some subflows were not extracted.`);

  await onProgress?.('definitions');
  const steps = flows.flatMap((f) => f.steps);
  const actionTypeIds = [...new Set(steps.filter((s) => s.kind === 'action').map((s) => s.definitionId))];
  const actionFields = fieldsOf(snActionTypeSchema);
  let actionTypeRows = await safeListIn('sys_hub_action_type_base', 'sys_id', actionTypeIds, actionFields);
  if (actionTypeRows.length === 0 && actionTypeIds.length > 0) {
    actionTypeRows = await safeListIn('sys_hub_action_type_definition', 'sys_id', actionTypeIds, actionFields);
  }
  const logicIds = [...new Set(steps.filter((s) => s.kind === 'logic').map((s) => s.definitionId))];
  const logicRows = await safeListIn('sys_hub_flow_logic_definition', 'sys_id', logicIds, fieldsOf(snLogicDefinitionSchema));

  const referencedIds = new Set<string>();
  for (const s of steps) {
    for (const m of JSON.stringify(s.values).matchAll(/\b[0-9a-f]{32}\b/g)) {
      if (referencedIds.size < 2000) referencedIds.add(m[0]);
    }
  }
  const groupRows = await safeListIn('sys_user_group', 'sys_id', [...referencedIds], fieldsOf(snGroupSchema));
  const groupIds = new Set(groupRows.map((g) => String(g.sys_id)));
  const userRows = await safeListIn(
    'sys_user',
    'sys_id',
    [...referencedIds].filter((id) => !groupIds.has(id)),
    fieldsOf(snUserSchema),
  );

  return {
    version: SERVICENOW_SNAPSHOT_VERSION,
    instanceUrl: client.instanceUrl,
    extractedAt: new Date().toISOString(),
    release,
    catalogs,
    categories,
    items,
    variables,
    variableSets,
    variableSetItems,
    choices,
    flows,
    actionTypes: parseRows(snActionTypeSchema, actionTypeRows),
    logicDefinitions: parseRows(snLogicDefinitionSchema, logicRows),
    groups: parseRows(snGroupSchema, groupRows),
    users: parseRows(snUserSchema, userRows),
    warnings,
  };
}
