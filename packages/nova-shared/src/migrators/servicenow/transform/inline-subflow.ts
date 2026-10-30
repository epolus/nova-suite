/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PillContext } from './pills';
import type { StepClass } from './classify';
import { MAX_SUBFLOW_INLINE_DEPTH, type FlowLookups } from './flow-types';
import { publicInputs } from './step-values';
import { buildTree, isExitOnlyBranch, isNoiseStep, type FlowNode } from './tree';

/**
 * Replaces subflow calls with the subflow's own steps. Nova sub-workflows cannot pause for
 * approvals or manual tasks and only receive plain values, so ServiceNow subflows (which pass
 * records such as the requested item) run correctly only when inlined.
 */
export function inlineSubflows(
  nodes: FlowNode[],
  lookups: FlowLookups,
  depth: number,
  stack: string[],
): void {
  for (const n of nodes) {
    if (n.cls === 'subflow') {
      const sub = lookups.flows.get(n.step.subflowId);
      const cyclic = stack.includes(n.step.subflowId);
      if (sub && sub.steps.length > 0 && !cyclic && depth < MAX_SUBFLOW_INLINE_DEPTH) {
        const inner: PillContext = {
          fields: n.ctx.fields,
          aliases: new Map(),
          isSubflow: true,
          notes: n.ctx.notes,
          subflowInputs: { values: publicInputs(n.step.values), parent: n.ctx },
        };
        n.cls = 'inline_subflow';
        n.defName = sub.name || 'Subflow';
        n.label = `${n.step.order}. Subflow: ${n.defName}`;
        n.innerCtx = inner;
        n.children = buildTree(sub, lookups, inner);
        inlineSubflows(n.children, lookups, depth + 1, [...stack, n.step.subflowId]);
        continue;
      }
      if (cyclic || (sub && depth >= MAX_SUBFLOW_INLINE_DEPTH)) {
        n.ctx.notes.warn('subflow_not_inlined', `Subflow "${sub?.name ?? n.step.subflowId}" is recursive or nested too deeply; it is called as a sub-workflow.`, n.label);
      }
    }
    inlineSubflows(n.children, lookups, depth, stack);
  }
}

/**
 * Catalog flows wrap "Ask For Approval" in a tiny subflow (approve → if rejected → set output → end)
 * and then check that output in the parent. Inlining that literally creates a chain of if/assign/end
 * nodes; collapse it to one approval whose reject path ends the flow.
 */
function matchApprovalGate(children: FlowNode[]): FlowNode | null {
  const meaningful = children.filter((n) => !isNoiseStep(n));
  if (meaningful.length === 0 || meaningful.length > 2) return null;
  if (meaningful[0].cls !== 'approval') return null;
  if (meaningful.length === 2) {
    if (meaningful[1].cls !== 'if' || !isExitOnlyBranch(meaningful[1].children)) return null;
  }
  return meaningful[0];
}

const FLATTEN_SINGLE = new Set<StepClass>(['email', 'notification', 'worknote', 'log']);

function withCallerIdentity(
  step: FlowNode['step'],
  caller: FlowNode['step'],
  extra: Partial<FlowNode['step']> = {},
): FlowNode['step'] {
  return {
    ...step,
    ...extra,
    uiId: caller.uiId,
    sysId: caller.sysId,
    order: caller.order,
    parentUiId: caller.parentUiId,
  };
}

/**
 * Removes approval-gate scaffolding and lifts single-action subflows (e.g. email wrappers) so the
 * Nova graph matches the catalog author's intent instead of Flow Designer's nesting.
 */
export function simplifyInlinedSubflows(nodes: FlowNode[]): void {
  for (const n of nodes) simplifyInlinedSubflows(n.children);

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.cls !== 'inline_subflow') continue;

    const gate = matchApprovalGate(n.children);
    const next = nodes[i + 1];
    if (gate && next?.cls === 'if' && isExitOnlyBranch(next.children)) {
      const elseNode = nodes[i + 2];
      if (elseNode?.cls === 'else' && !isExitOnlyBranch(elseNode.children)) continue;
      n.cls = 'approval';
      n.flowName = n.defName;
      n.label = `${n.step.order}. ${n.defName}`;
      n.step = withCallerIdentity(gate.step, n.step, { comment: gate.step.comment || n.defName });
      n.children = [];
      n.innerCtx = undefined;
      n.rejectToFinish = true;
      const remove = elseNode?.cls === 'else' && isExitOnlyBranch(elseNode.children) ? 2 : 1;
      nodes.splice(i + 1, remove);
      continue;
    }

    const meaningful = n.children.filter((c) => !isNoiseStep(c));
    if (meaningful.length === 1 && FLATTEN_SINGLE.has(meaningful[0].cls)) {
      const child = meaningful[0];
      const inputs = n.innerCtx?.subflowInputs?.values ?? {};
      child.step = withCallerIdentity(child.step, n.step, {
        values: { ...child.step.values, ...publicInputs(inputs) },
      });
      // Keep the child's pill scope so `{{subflow.*}}` inputs still resolve.
      nodes[i] = child;
    }
  }
}
