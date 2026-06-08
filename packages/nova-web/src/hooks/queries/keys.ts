/* SPDX-License-Identifier: AGPL-3.0-only */

export const queryKeys = {
  incidents: {
    all: ['incidents'] as const,
    lists: () => [...queryKeys.incidents.all, 'list'] as const,
    list: (params: Record<string, string>, page: number, limit: number) =>
      [...queryKeys.incidents.lists(), params, page, limit] as const,
    details: () => [...queryKeys.incidents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.incidents.details(), id] as const,
    journal: (id: string) => [...queryKeys.incidents.detail(id), 'journal'] as const,
    assignmentGroups: () => [...queryKeys.incidents.all, 'assignment-groups'] as const,
  },
  requests: {
    all: ['requests'] as const,
    lists: () => [...queryKeys.requests.all, 'list'] as const,
    list: (params: Record<string, string>, page: number, limit: number) =>
      [...queryKeys.requests.lists(), params, page, limit] as const,
    details: () => [...queryKeys.requests.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.requests.details(), id] as const,
    tasks: (id: string) => [...queryKeys.requests.detail(id), 'tasks'] as const,
  },
  problems: {
    all: ['problems'] as const,
    lists: () => [...queryKeys.problems.all, 'list'] as const,
    list: (params: Record<string, string>, page: number, limit: number) =>
      [...queryKeys.problems.lists(), params, page, limit] as const,
    details: () => [...queryKeys.problems.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.problems.details(), id] as const,
  },
  changes: {
    all: ['changes'] as const,
    lists: () => [...queryKeys.changes.all, 'list'] as const,
    list: (params: Record<string, string>, page: number, limit: number) =>
      [...queryKeys.changes.lists(), params, page, limit] as const,
    details: () => [...queryKeys.changes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.changes.details(), id] as const,
  },
  cart: {
    all: ['cart'] as const,
  },
} as const;
