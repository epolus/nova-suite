/* SPDX-License-Identifier: AGPL-3.0-only */
import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  setKnowledgeArticleStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds' },
});

export interface KnowledgeApprovalInput {
  articleId: string;
  tenantId: string;
  steps: { step_order: number; assignment_group_id: string }[];
}

export interface KnowledgeApprovalDecisionSignal {
  stepOrder: number;
  decision: 'approved' | 'rejected';
}

export const kbApprovalDecisionSignal = defineSignal<[KnowledgeApprovalDecisionSignal]>('kbApprovalDecision');

export async function knowledgeApproval(input: KnowledgeApprovalInput): Promise<string> {
  const decisions = new Map<number, 'approved' | 'rejected'>();
  setHandler(kbApprovalDecisionSignal, (payload) => {
    if (!payload?.stepOrder || !payload?.decision) return;
    decisions.set(payload.stepOrder, payload.decision);
  });

  const sortedSteps = [...input.steps].sort((a, b) => a.step_order - b.step_order);
  if (sortedSteps.length === 0) {
    await setKnowledgeArticleStatus(input.articleId, input.tenantId, 'published', 'No approval steps configured');
    return 'published_no_steps';
  }

  await setKnowledgeArticleStatus(input.articleId, input.tenantId, 'review');

  for (const step of sortedSteps) {
    await condition(() => decisions.has(step.step_order), '30 days');
    const decision = decisions.get(step.step_order);
    if (decision === 'rejected') {
      await setKnowledgeArticleStatus(input.articleId, input.tenantId, 'draft', `Rejected at step ${step.step_order}`);
      return `rejected_step_${step.step_order}`;
    }
  }

  await setKnowledgeArticleStatus(input.articleId, input.tenantId, 'published', 'Approved by workflow');
  return 'published';
}
