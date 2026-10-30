/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AutomationConfig } from '../../../automation-config';
import type { SnCategory } from '../raw-schemas';
import type { ServiceNowFlow, ServiceNowSnapshot } from '../snapshot';
import { convertFlow, type FlowLookups } from './flow';
import {
  NoteCollector,
  type MigrationItemReport,
  type MigrationReport,
  type MigrationSubflowReport,
} from './report';
import { htmlToText, slugify, snExternalKey, truncate } from './text';
import { convertVariables, orderItemVariables, type NovaFormField } from './variables';

export type MigrationCatalogTask = {
  external_key: string;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: 'approval' | 'manual' | 'automated';
  task_order: number;
  assigned_group_name: string | null;
  sla_hours: number | null;
  automation_config: Record<string, unknown>;
  is_active: boolean;
};

export type MigrationServiceItem = {
  external_key: string;
  category_external_key: string;
  name: string;
  short_description: string | null;
  description: string | null;
  icon: string;
  price: number | null;
  custom_attributes: Record<string, unknown>;
  form_schema: { fields: NovaFormField[] };
  approval_required: boolean;
  sla_hours: number;
  is_active: boolean;
  tasks: MigrationCatalogTask[];
};

export type MigrationCategory = {
  external_key: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

export type MigrationWorkflowDefinition = {
  name: string;
  workflow_type: string;
  description: string | null;
  definition: AutomationConfig;
};

export type MigrationConfigPackage = {
  format: 'nova.config-package';
  version: 1;
  name: string;
  schema_version: string;
  exported_at: string;
  source: { instance: string };
  contents: {
    catalog: { categories: MigrationCategory[]; service_items: MigrationServiceItem[] };
    notifications: { rules: [] };
    data_sources: { sources: [] };
    workflows: { definitions: MigrationWorkflowDefinition[] };
  };
};

export type TransformOptions = {
  schemaVersion: string;
  packageName?: string;
  now?: Date;
};

const UNCATEGORIZED_KEY = 'sn/uncategorized';

function categoryPath(cat: SnCategory, byId: Map<string, SnCategory>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let cur: SnCategory | undefined = cat;
  while (cur && !seen.has(cur.sys_id)) {
    seen.add(cur.sys_id);
    names.unshift(cur.title || 'Untitled');
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return truncate(names.join(' / '), 255);
}

export function transformServiceNowSnapshot(
  snapshot: ServiceNowSnapshot,
  options: TransformOptions,
): { package: MigrationConfigPackage; report: MigrationReport } {
  const now = (options.now ?? new Date()).toISOString();
  const categoriesById = new Map(snapshot.categories.map((c) => [c.sys_id, c]));
  const flowsById = new Map(snapshot.flows.map((f) => [f.sys_id, f]));
  const lookups: FlowLookups = {
    actionTypes: new Map(snapshot.actionTypes.map((a) => [a.sys_id, a])),
    logicDefinitions: new Map(snapshot.logicDefinitions.map((l) => [l.sys_id, l])),
    groups: new Map(snapshot.groups.map((g) => [g.sys_id, g])),
    users: new Map(snapshot.users.map((u) => [u.sys_id, u])),
    subflowTypes: new Map(),
    flows: flowsById,
    calledSubflows: new Set(),
  };

  const itemFlowIds = new Set(snapshot.items.map((i) => i.flow_designer_flow).filter(Boolean));
  const subflows = snapshot.flows.filter((f) => !itemFlowIds.has(f.sys_id) || f.type === 'subflow');
  const usedTypes = new Set<string>();
  for (const sf of subflows) {
    let type = `sn_${slugify(sf.internal_name || sf.name, 60)}`;
    let i = 2;
    while (usedTypes.has(type)) type = `sn_${slugify(sf.internal_name || sf.name, 56)}_${i++}`;
    usedTypes.add(type);
    lookups.subflowTypes.set(sf.sys_id, type);
  }

  const categoryKeys = new Map<string, MigrationCategory>();
  const ensureCategory = (catId: string): string => {
    const cat = categoriesById.get(catId);
    if (!cat) {
      if (!categoryKeys.has(UNCATEGORIZED_KEY)) {
        categoryKeys.set(UNCATEGORIZED_KEY, {
          external_key: UNCATEGORIZED_KEY,
          name: 'ServiceNow (uncategorized)',
          description: 'Items migrated from ServiceNow without a category in the selection.',
          icon: 'folder',
          sort_order: 9999,
          is_active: true,
        });
      }
      return UNCATEGORIZED_KEY;
    }
    const key = snExternalKey(cat.sys_id);
    if (!categoryKeys.has(key)) {
      categoryKeys.set(key, {
        external_key: key,
        name: categoryPath(cat, categoriesById),
        description: htmlToText(cat.description) || null,
        icon: 'folder',
        sort_order: Math.max(0, cat.order),
        is_active: cat.active,
      });
    }
    return key;
  };

  const serviceItems: MigrationServiceItem[] = [];
  const itemReports: MigrationItemReport[] = [];
  let totalFields = 0;
  let totalScripts = 0;

  for (const item of snapshot.items) {
    const notes = new NoteCollector();
    const key = snExternalKey(item.sys_id);
    const categoryKey = ensureCategory(item.category);
    if (categoryKey === UNCATEGORIZED_KEY) notes.info('category_missing', 'Category not in the selection; placed in "ServiceNow (uncategorized)".');

    const setLinks = snapshot.variableSetItems.filter((l) => l.sc_cat_item === item.sys_id);
    const vars = orderItemVariables(item.sys_id, snapshot.variables, setLinks);
    const { fields, mappings } = convertVariables(vars, snapshot.choices, notes);
    totalFields += fields.length;

    const tasks: MigrationCatalogTask[] = [];
    let order = 1;
    let approvalRequired = false;
    let flow: ServiceNowFlow | undefined;
    let stateCount = 0;
    let scriptSteps = 0;
    const servicenowAttrs: Record<string, unknown> = {
      sys_id: item.sys_id,
      instance: snapshot.instanceUrl,
      sys_class_name: item.sys_class_name,
      catalogs: item.sc_catalogs ? item.sc_catalogs.split(',') : [],
    };
    const manualFallback = (reason: string) => {
      tasks.push({
        external_key: `${key}/fulfill`,
        name: 'Fulfill request',
        description: null,
        instructions: truncate(reason, 4000),
        task_type: 'manual',
        task_order: order++,
        assigned_group_name: null,
        sla_hours: null,
        automation_config: {},
        is_active: true,
      });
    };

    if (item.flow_designer_flow) {
      flow = flowsById.get(item.flow_designer_flow);
      servicenowAttrs.flow_sys_id = item.flow_designer_flow;
      if (!flow) {
        notes.error('flow_missing', `Flow ${item.flow_designer_flow} could not be extracted.`);
        manualFallback('The ServiceNow flow for this item could not be read; fulfill manually.');
      } else {
        servicenowAttrs.flow_name = flow.name;
        if (flow.triggerName && !/catalog|requested item|sc_req_item/i.test(flow.triggerName)) {
          notes.warn('flow_trigger', `Flow trigger "${flow.triggerName}" is not a Service Catalog trigger.`);
        }
        if (!flow.active) notes.info('flow_inactive', 'The ServiceNow flow is inactive; it was converted anyway.');
        const result = convertFlow(flow, { lookups, fields: mappings, notes, isSubflow: false, extractPreApproval: true });
        for (const id of result.calledSubflowIds) lookups.calledSubflows.add(id);
        scriptSteps = result.scriptSteps;
        if (result.unmappedSteps.length > 0) servicenowAttrs.unmapped_steps = result.unmappedSteps;
        if (result.preApproval?.approverType === 'requester_manager') {
          // Runtime injects a manager-approval task when service_items.approval_required is set.
          approvalRequired = true;
        } else if (result.preApproval) {
          tasks.push({
            external_key: `${key}/approval`,
            name: result.preApproval.name,
            description: null,
            instructions: 'Please review and approve or reject this request.',
            task_type: 'approval',
            task_order: order++,
            assigned_group_name: result.preApproval.groupName,
            sla_hours: null,
            automation_config: { approval_mode: 'group_members' },
            is_active: true,
          });
        }
        if (result.config) {
          stateCount = result.config.states.length;
          tasks.push({
            external_key: `${key}/flow`,
            name: truncate(flow.name || 'Automation', 255),
            description: truncate(`Migrated from ServiceNow flow ${flow.sys_id}.`, 2000),
            instructions: null,
            task_type: 'automated',
            task_order: order++,
            assigned_group_name: null,
            sla_hours: null,
            automation_config: result.config as unknown as Record<string, unknown>,
            is_active: true,
          });
        } else if (notes.notes.some((n) => n.severity === 'error')) {
          manualFallback(`The ServiceNow flow "${flow.name}" could not be converted automatically; fulfill manually.`);
        }
        if (tasks.length === 0) manualFallback('The ServiceNow flow had no steps to convert.');
      }
    } else if (item.workflow) {
      servicenowAttrs.legacy_workflow = item.workflow;
      notes.warn('legacy_workflow', 'Item uses a legacy workflow, which is not converted; a manual fulfillment task was added.');
      manualFallback('This item used a ServiceNow legacy workflow. Fulfill manually or build an automation.');
    } else {
      notes.info('no_flow', 'Item has no flow; a manual fulfillment task was added.');
      manualFallback('Fulfill this request.');
    }

    totalScripts += scriptSteps;
    serviceItems.push({
      external_key: key,
      category_external_key: categoryKey,
      name: truncate(item.name || item.sys_id, 255),
      short_description: truncate(htmlToText(item.short_description), 500) || null,
      description: htmlToText(item.description) || null,
      icon: 'box',
      price: item.price !== null && item.price >= 0 ? item.price : null,
      custom_attributes: { servicenow: servicenowAttrs },
      form_schema: { fields },
      approval_required: approvalRequired,
      sla_hours: 72,
      is_active: item.active,
      tasks,
    });
    itemReports.push({
      externalKey: key,
      sysId: item.sys_id,
      name: item.name,
      categoryName: categoryKeys.get(categoryKey)?.name ?? '',
      status: notes.status(),
      flowName: flow?.name ?? null,
      fieldCount: fields.length,
      taskCount: tasks.length,
      automationStateCount: stateCount,
      scriptSteps,
      notes: notes.notes,
    });
  }

  // Subflows are inlined into their callers; only those that could not be inlined become sub-workflows.
  const workflowDefinitions: MigrationWorkflowDefinition[] = [];
  const subflowReports: MigrationSubflowReport[] = [];
  const converted = new Set<string>();
  for (let pending = [...lookups.calledSubflows]; pending.length > 0; pending = [...lookups.calledSubflows].filter((id) => !converted.has(id))) {
    for (const id of pending) {
      converted.add(id);
      const sf = flowsById.get(id);
      const workflowType = lookups.subflowTypes.get(id);
      if (!sf || !workflowType) continue;
      const notes = new NoteCollector();
      const result = convertFlow(sf, { lookups, fields: new Map(), notes, isSubflow: true, extractPreApproval: false });
      for (const id of result.calledSubflowIds) lookups.calledSubflows.add(id);
      if (result.config) {
        workflowDefinitions.push({
          name: truncate(sf.name || workflowType, 255),
          workflow_type: workflowType,
          description: truncate(`Migrated from ServiceNow subflow ${sf.sys_id}. ${htmlToText(sf.description)}`.trim(), 2000),
          definition: result.config,
        });
      } else if (!notes.notes.some((n) => n.severity === 'error')) {
        notes.error('subflow_empty', 'Subflow produced no executable steps.');
      }
      subflowReports.push({ sysId: sf.sys_id, name: sf.name, workflowType, status: notes.status(), notes: notes.notes });
    }
  }

  const categories = [...categoryKeys.values()];
  const pkg: MigrationConfigPackage = {
    format: 'nova.config-package',
    version: 1,
    name: truncate(options.packageName ?? `ServiceNow migration (${snapshot.instanceUrl.replace(/^https:\/\//, '')})`, 255),
    schema_version: options.schemaVersion,
    exported_at: now,
    source: { instance: truncate(snapshot.instanceUrl, 255) },
    contents: {
      catalog: { categories, service_items: serviceItems },
      notifications: { rules: [] },
      data_sources: { sources: [] },
      workflows: { definitions: workflowDefinitions },
    },
  };
  const report: MigrationReport = {
    generatedAt: now,
    instanceUrl: snapshot.instanceUrl,
    release: snapshot.release,
    totals: {
      categories: categories.length,
      items: itemReports.length,
      full: itemReports.filter((r) => r.status === 'full').length,
      partial: itemReports.filter((r) => r.status === 'partial').length,
      unsupported: itemReports.filter((r) => r.status === 'unsupported').length,
      fields: totalFields,
      subflows: workflowDefinitions.length,
      scriptSteps: totalScripts,
    },
    items: itemReports,
    subflows: subflowReports,
    warnings: snapshot.warnings,
  };
  return { package: pkg, report };
}

/** Keeps only the selected items (and the categories/sub-workflows they need). */
export function selectPackageItems(pkg: MigrationConfigPackage, itemKeys: string[]): MigrationConfigPackage {
  const keep = new Set(itemKeys);
  const items = pkg.contents.catalog.service_items.filter((i) => keep.has(i.external_key));
  const catKeys = new Set(items.map((i) => i.category_external_key));
  const usedTypes = new Set<string>();
  const collect = (cfg: unknown) => {
    const states = (cfg as { states?: Array<Record<string, unknown>> })?.states ?? [];
    for (const s of states) if (s.type === 'call.workflow' && typeof s.workflowType === 'string') usedTypes.add(s.workflowType);
  };
  for (const i of items) for (const t of i.tasks) collect(t.automation_config);
  // Sub-workflows can call other sub-workflows.
  let grew = true;
  while (grew) {
    const before = usedTypes.size;
    for (const d of pkg.contents.workflows.definitions) if (usedTypes.has(d.workflow_type)) collect(d.definition);
    grew = usedTypes.size > before;
  }
  return {
    ...pkg,
    contents: {
      ...pkg.contents,
      catalog: {
        categories: pkg.contents.catalog.categories.filter((c) => catKeys.has(c.external_key)),
        service_items: items,
      },
      workflows: { definitions: pkg.contents.workflows.definitions.filter((d) => usedTypes.has(d.workflow_type)) },
    },
  };
}
