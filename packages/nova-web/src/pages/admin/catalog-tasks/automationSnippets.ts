/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CatalogTasksListLocationState } from './types';

export const TASK_TYPE_VALUES = ['approval', 'manual', 'automated'] as const;

export function catalogTasksReturnState(serviceItemId: string | undefined): CatalogTasksListLocationState | undefined {
  if (!serviceItemId) return undefined;
  return { catalogTasksTab: 'by-item', focusServiceItemId: serviceItemId };
}

export const AUTOMATION_SNIPPET_IDS = ['stateBasic', 'stateDecision'] as const;

/** Full automation_config examples (replace editor). */
export const AUTOMATION_SNIPPET_JSON: Record<typeof AUTOMATION_SNIPPET_IDS[number], string> = {
  stateBasic: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'check',
        states: [
          {
            id: 'check',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            retryAttempts: 2,
            retryBackoffSec: 2,
            transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
            onSuccess: { mergeFormData: { rest_ok: 'true' } },
          },
          { id: 'done', type: 'end', result: 'success' },
          { id: 'failed', type: 'end', result: 'failure', onFailure: { skipTaskOrders: [], rejectRequest: false } },
        ],
      },
      null,
      2,
    ),
  stateDecision: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'probe',
        states: [
          {
            id: 'probe',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/json',
            transitions: [{ to: 'branch' }],
          },
          {
            id: 'branch',
            type: 'decision',
            condition: '{{response.status}}',
            transitions: [{ to: 'pause', when: 'true' }, { to: 'rejected', when: 'false' }],
          },
          { id: 'pause', type: 'delay', delaySeconds: 5, transitions: [{ to: 'approved' }] },
          { id: 'approved', type: 'end', result: 'success' },
          { id: 'rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } },
        ],
      },
      null,
      2,
    ),
};

export function isEmptyAutomationJson(s: string): boolean {
  try {
    const o = JSON.parse(s || '{}') as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) && Object.keys(o as object).length === 0;
  } catch {
    return false;
  }
}

export const TEMPLATE_TOKEN_KEYS = [
  'requestNumber',
  'requestId',
  'requestFormData',
  'responseBody',
  'envVar',
  'vaultCredential',
] as const;

export const TEMPLATE_TOKENS: Record<typeof TEMPLATE_TOKEN_KEYS[number], string> = {
  requestNumber: '{{request.number}}',
  requestId: '{{request.id}}',
  requestFormData: '{{request.form_data.FIELD}}',
  responseBody: '{{response.body}}',
  envVar: '{{env.VAR_NAME}}',
  vaultCredential: '{{cred.slug}}',
};
