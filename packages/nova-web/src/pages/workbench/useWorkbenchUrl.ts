/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  closeWorkbenchTab,
  openWorkbenchTab,
  parseWorkbenchSearch,
  serializeWorkbenchSearch,
  type WorkbenchQueue,
  type WorkbenchUrlState,
} from './workbenchUrl';

export function useWorkbenchUrl() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseWorkbenchSearch(params.toString()), [params]);

  const replace = (next: WorkbenchUrlState) => {
    setParams(new URLSearchParams(serializeWorkbenchSearch(next)), { replace: true });
  };

  return {
    ...state,
    setQueue: (queue: WorkbenchQueue) => replace({ ...state, queue }),
    open: (number: string) => replace(openWorkbenchTab(state, number)),
    close: (number: string) => replace(closeWorkbenchTab(state, number)),
    activate: (number: string) => {
      if (!state.tabs.includes(number)) return;
      replace({ ...state, active: number });
    },
  };
}
