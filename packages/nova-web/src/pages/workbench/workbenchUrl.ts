/* SPDX-License-Identifier: AGPL-3.0-only */
export const WORKBENCH_QUEUES = ['mine', 'unassigned', 'sla', 'major'] as const;
export type WorkbenchQueue = (typeof WORKBENCH_QUEUES)[number];

export const WORKBENCH_TAB_CAP = 12;

const NUMBER_RE = /^(INC|PRB|CHG|MI)\d{1,12}$/;

export type WorkbenchKind = 'incident' | 'problem' | 'change' | 'major_incident';

export type WorkbenchUrlState = {
  queue: WorkbenchQueue;
  tabs: string[];
  active: string | null;
};

export function isWorkbenchNumber(value: string): boolean {
  return NUMBER_RE.test(value);
}

export function recordKind(number: string): WorkbenchKind | null {
  if (!NUMBER_RE.test(number)) return null;
  if (number.startsWith('INC')) return 'incident';
  if (number.startsWith('PRB')) return 'problem';
  if (number.startsWith('CHG')) return 'change';
  if (number.startsWith('MI')) return 'major_incident';
  return null;
}

function isQueue(value: string | null): value is WorkbenchQueue {
  return WORKBENCH_QUEUES.some((queue) => queue === value);
}

export function parseWorkbenchSearch(search: string): WorkbenchUrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const queue = isQueue(params.get('queue')) ? params.get('queue') as WorkbenchQueue : 'mine';
  const seen = new Set<string>();
  const tabs: string[] = [];
  for (const part of (params.get('tabs') ?? '').split(',')) {
    const number = part.trim().toUpperCase();
    if (!isWorkbenchNumber(number) || seen.has(number)) continue;
    seen.add(number);
    tabs.push(number);
    if (tabs.length >= WORKBENCH_TAB_CAP) break;
  }
  const requested = (params.get('active') ?? '').trim().toUpperCase();
  const active = tabs.includes(requested) ? requested : (tabs[0] ?? null);
  return { queue, tabs, active };
}

export function serializeWorkbenchSearch(state: WorkbenchUrlState): string {
  const params = new URLSearchParams();
  params.set('queue', state.queue);
  if (state.active) params.set('active', state.active);
  if (state.tabs.length > 0) params.set('tabs', state.tabs.join(','));
  return params.toString();
}

export function openWorkbenchTab(state: WorkbenchUrlState, rawNumber: string): WorkbenchUrlState {
  const number = rawNumber.trim().toUpperCase();
  if (!isWorkbenchNumber(number)) return state;
  if (state.tabs.includes(number)) return { ...state, active: number };
  const tabs = [...state.tabs, number];
  while (tabs.length > WORKBENCH_TAB_CAP) {
    const drop = tabs.findIndex((item) => item !== number);
    if (drop < 0) break;
    tabs.splice(drop, 1);
  }
  return { ...state, tabs, active: number };
}

export function closeWorkbenchTab(state: WorkbenchUrlState, rawNumber: string): WorkbenchUrlState {
  const number = rawNumber.trim().toUpperCase();
  const index = state.tabs.indexOf(number);
  if (index < 0) return state;
  const tabs = state.tabs.filter((item) => item !== number);
  let active = state.active;
  if (active === number) {
    active = tabs[index] ?? tabs[index - 1] ?? null;
  }
  return { ...state, tabs, active };
}
