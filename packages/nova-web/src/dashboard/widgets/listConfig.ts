/* SPDX-License-Identifier: AGPL-3.0-only */
import type { DashboardWidgetInstance } from '../types';
import { DEFAULT_LIST_LIMIT, type ListWidgetConfig } from '../types';

export function getListLimit(instance: DashboardWidgetInstance): number {
  const config = (instance.config ?? {}) as ListWidgetConfig;
  const limit = config.limit;
  return typeof limit === 'number' && limit > 0 ? limit : DEFAULT_LIST_LIMIT;
}
