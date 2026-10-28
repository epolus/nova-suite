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

export function defineNode(
  type: UnifiedBuilderNodeType,
  opts: {
    templateType?: NodeType;
    description: string;
    schemaProperties: Record<string, unknown>;
    uischemaElements: UISchema[];
    defaults: Record<string, unknown>;
  },
): PaletteItem {
  const label = UNIFIED_BUILDER_NODE_LABELS[type];
  const builtDefaults = UNIFIED_BUILDER_NODE_DEFAULTS[type];
  return {
    label,
    description: opts.description,
    type,
    icon: NODE_TYPE_ICONS[type],
    templateType: opts.templateType ?? NodeType.Node,
    ...(type === 'start' ? { isStartNode: true } : {}),
    defaultPropertiesData: {
      label: builtDefaults.label || label,
      description: opts.description,
      ...opts.defaults,
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
