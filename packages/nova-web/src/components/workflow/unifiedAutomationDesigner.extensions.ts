/* SPDX-License-Identifier: AGPL-3.0-only */
import type { BuilderError, UnifiedBuilderNodeData } from './unifiedAutomationDesigner.internals';

const DESIGNER_MANAGED_STATE_KEYS = new Set([
  'id', 'type', 'transitions', 'method', 'url', 'retryAttempts', 'retryBackoffSec', 'onError', 'fallbackNodeId',
  'condition', 'expression', 'delaySeconds', 'result', 'className', 'name', 'displayName', 'attributes', 'channel',
  'recipientType', 'titleTemplate', 'bodyTemplate', 'entity', 'operation', 'fields', 'target', 'assigneeTemplate',
  'groupIdTemplate', 'runtime', 'code', 'workflowType', 'definitionId', 'input', 'itemsExpr', 'maxIterations',
  'joinId', 'approverType', 'approverTemplate', 'instructions', 'assignments',
]);

/** Collects state keys the designer has no editor for, so they survive a load/save round trip. */
export function extractExtraJson(state: Record<string, unknown>): string | undefined {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (!DESIGNER_MANAGED_STATE_KEYS.has(k) && v !== undefined) extra[k] = v;
  }
  return Object.keys(extra).length > 0 ? JSON.stringify(extra) : undefined;
}

export function parseExtraJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!DESIGNER_MANAGED_STATE_KEYS.has(k)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Branch-label and pairing checks for loop, approval and fork nodes. */
export function validateExtensionNode(
  type: string,
  data: { label: string; joinId?: string },
  transitions: Array<{ when?: string }>,
  nodeIds: Set<string>,
  errors: BuilderError[],
): void {
  const labels = new Set(transitions.map((tr) => String(tr.when || '')));
  if (type === 'loop.foreach' && (!labels.has('item') || !labels.has('done'))) {
    errors.push({ code: 'loopNeedsItemDone', params: { label: data.label } });
  }
  if (type === 'action.approval' && (!labels.has('approved') || !labels.has('rejected'))) {
    errors.push({ code: 'approvalNeedsApprovedRejected', params: { label: data.label } });
  }
  if (type === 'parallel.fork' && (!data.joinId || !nodeIds.has(data.joinId))) {
    errors.push({ code: 'forkNeedsJoin', params: { label: data.label } });
  }
}

export function parseOptionalJsonObject(
  raw: string | undefined,
  errors: BuilderError[],
  label: string,
): Record<string, unknown> | undefined {
  const text = (raw || '').trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push({ code: 'actionInvalidAttributes', params: { label } });
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    errors.push({ code: 'actionInvalidAttributes', params: { label } });
    return undefined;
  }
}

/** Serializes loop, parallel, approval and variables nodes; returns null for other node types. */
export function serializeExtensionState(
  type: string,
  id: string,
  data: UnifiedBuilderNodeData,
  transitions: Array<{ to: string; when?: string }>,
  errors: BuilderError[],
): Record<string, unknown> | null {
  switch (type) {
    case 'loop.foreach':
      return {
        id,
        type,
        itemsExpr: data.itemsExpr || '',
        ...(data.maxIterations ? { maxIterations: data.maxIterations } : {}),
        transitions,
      };
    case 'parallel.fork':
      return { id, type, joinId: data.joinId || '', transitions };
    case 'parallel.join':
      return { id, type, transitions };
    case 'action.approval':
      return {
        id,
        type,
        approverType: data.approverType || 'requester_manager',
        ...(data.approverTemplate ? { approverTemplate: data.approverTemplate } : {}),
        ...(data.approvalName ? { name: data.approvalName } : {}),
        ...(data.instructions ? { instructions: data.instructions } : {}),
        transitions,
      };
    case 'variables.set':
      return {
        id,
        type,
        assignments: parseOptionalJsonObject(data.assignmentsJson, errors, data.label) ?? {},
        transitions,
      };
    default:
      return null;
  }
}
