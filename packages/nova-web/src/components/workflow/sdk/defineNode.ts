/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  getScope,
  NodeType,
  sharedProperties,
  type PaletteItem,
  type UISchema,
} from '@workflowbuilder/sdk';
import { UNIFIED_BUILDER_NODE_DEFAULTS, UNIFIED_BUILDER_NODE_LABELS } from '@nova-suite/shared';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';
import { NODE_TYPE_ICONS } from './icons';

export const scope = getScope;

export const NODE_DESCRIPTIONS: Record<UnifiedBuilderNodeType, string> = {
  start: 'Workflow entry point',
  activity: 'HTTP activity step',
  decision: 'Branch on a template condition',
  delay: 'Wait before continuing',
  end: 'Terminal success or failure',
  'action.rest': 'REST HTTP action',
  'action.ci.lookup': 'Look up a configuration item',
  'action.ci.create': 'Create a configuration item',
  'decision.advanced': 'Branch on an advanced expression',
  'action.notification': 'Send an in-app or email notification',
  'action.ticket': 'Create or update an incident or request',
  'action.assign': 'Assign the current catalog task to a user or group',
  'action.script': 'Run a short JavaScript step',
  'call.workflow': 'Run a published workflow definition',
  'loop.foreach': 'Repeat the body for each item (edges: item, done)',
  'parallel.fork': 'Run outgoing branches concurrently until the join',
  'parallel.join': 'Wait for all parallel branches',
  'action.approval': 'Pause for a human approval (edges: approved, rejected)',
  'action.task': 'Create a manual task and wait until it is completed',
  'variables.set': 'Set flow variables available as {{vars.name}}',
};

function baseUi(extra: UISchema[]): UISchema {
  return {
    type: 'VerticalLayout',
    elements: [
      { type: 'Text', scope: scope('properties.label'), label: 'Label' },
      { type: 'TextArea', scope: scope('properties.description'), label: 'Description' },
      ...extra,
    ],
  };
}

/** Palette defaults from the shared table, without the canvas label and type. */
function sharedPaletteDefaults(type: UnifiedBuilderNodeType): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...UNIFIED_BUILDER_NODE_DEFAULTS[type] };
  delete rest.label;
  delete rest.nodeType;
  return rest;
}

export function defineNode(
  type: UnifiedBuilderNodeType,
  opts: {
    templateType?: NodeType;
    schemaProperties: Record<string, unknown>;
    uischemaElements: UISchema[];
    /** Overrides shared defaults. Omit when the palette matches UNIFIED_BUILDER_NODE_DEFAULTS. */
    defaults?: Record<string, unknown>;
  },
): PaletteItem {
  const label = UNIFIED_BUILDER_NODE_LABELS[type];
  const builtDefaults = UNIFIED_BUILDER_NODE_DEFAULTS[type];
  const description = NODE_DESCRIPTIONS[type];
  return {
    label,
    description,
    type,
    icon: NODE_TYPE_ICONS[type],
    templateType: opts.templateType ?? NodeType.Node,
    ...(type === 'start' ? { isStartNode: true } : {}),
    defaultPropertiesData: {
      label: builtDefaults.label || label,
      description,
      ...(opts.defaults ?? sharedPaletteDefaults(type)),
    },
    schema: {
      type: 'object',
      required: ['label'],
      properties: {
        ...sharedProperties,
        ...opts.schemaProperties,
      },
    },
    uischema: baseUi(opts.uischemaElements),
  } as PaletteItem;
}
