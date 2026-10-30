/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ServiceNowFlow, ServiceNowStep } from '../snapshot';
import type { PillContext, StepAlias } from './pills';
import { truncate } from './text';
import { classifyAction, classifyLogic, type StepClass } from './classify';
import type { FlowLookups } from './flow-types';

export type FlowNode = {
  step: ServiceNowStep;
  cls: StepClass;
  defName: string;
  label: string;
  stateId: string;
  children: FlowNode[];
  /** Name of the ServiceNow flow or subflow the step belongs to. */
  flowName: string;
  /** Pill scope of the flow this step belongs to. */
  ctx: PillContext;
  /** For inlined subflows: the pill scope of the subflow's own steps. */
  innerCtx?: PillContext;
  /**
   * Approval that replaced an "approval gate" subflow whose caller then ends on reject.
   * Rejected goes straight to the flow's reject finish instead of through if/assign/end scaffolding.
   */
  rejectToFinish?: boolean;
};

export function buildTree(flow: ServiceNowFlow, lookups: FlowLookups, ctx: PillContext): FlowNode[] {
  const nodes = flow.steps.map((step): FlowNode => {
    let cls: StepClass;
    let defName: string;
    if (step.kind === 'subflow') {
      cls = 'subflow';
      defName = 'Subflow';
    } else if (step.kind === 'logic') {
      const def = lookups.logicDefinitions.get(step.definitionId);
      cls = classifyLogic(def);
      defName = def?.name || def?.type || 'Flow Logic';
    } else {
      const def = lookups.actionTypes.get(step.definitionId);
      cls = classifyAction(def, step.values);
      defName = def?.name || def?.internal_name || 'Action';
    }
    const label = `${step.order}. ${defName}${step.comment ? ` (${truncate(step.comment, 60)})` : ''}`;
    return { step, cls, defName, label, stateId: '', children: [], flowName: flow.name, ctx };
  });
  const byUi = new Map(nodes.map((n) => [n.step.uiId, n]));
  const roots: FlowNode[] = [];
  for (const n of nodes) {
    const parent = n.step.parentUiId ? byUi.get(n.step.parentUiId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const sortRec = (list: FlowNode[]) => {
    list.sort((a, b) => a.step.order - b.step.order);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function walk(nodes: FlowNode[], fn: (n: FlowNode, inParallel: boolean) => void, inParallel = false): void {
  for (const n of nodes) {
    fn(n, inParallel);
    walk(n.children, fn, inParallel || n.cls === 'parallel');
  }
}

/** Steps that do not affect control flow when deciding if a branch is exit-only. */
export function isNoiseStep(n: FlowNode): boolean {
  return n.cls === 'log' || (n.cls === 'container' && n.children.every(isNoiseStep));
}

export function isExitOnlyBranch(nodes: FlowNode[]): boolean {
  return nodes.every((n) => {
    if (isNoiseStep(n) || n.cls === 'end' || n.cls === 'subflow_outputs') return true;
    if (n.cls === 'container') return isExitOnlyBranch(n.children);
    return false;
  });
}

export function aliasKind(cls: StepClass): StepAlias['kind'] {
  if (cls === 'approval') return 'approval';
  if (cls === 'foreach') return 'loop';
  if (cls === 'subflow') return 'subflow';
  if (cls === 'inline_subflow') return 'inline_subflow';
  return 'action';
}
