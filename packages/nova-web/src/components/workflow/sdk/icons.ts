/* SPDX-License-Identifier: AGPL-3.0-only */
import type { IconType } from '@workflowbuilder/sdk';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';

export const NODE_TYPE_ICONS: Record<UnifiedBuilderNodeType, IconType> = {
  start: 'Play',
  activity: 'Lightning',
  decision: 'GitBranch',
  delay: 'Timer',
  end: 'Stop',
  'action.rest': 'WebhooksLogo',
  'action.ci.lookup': 'MagnifyingGlass',
  'action.ci.create': 'PlusCircle',
  'decision.advanced': 'TreeStructure',
  'action.notification': 'Bell',
  'action.ticket': 'Ticket',
  'action.assign': 'UserPlus',
  'action.script': 'Code',
  'call.workflow': 'ShareNetwork',
};
