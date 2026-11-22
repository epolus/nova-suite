/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { CIClass } from '../../api/client';
import { buildClassTree, classOptionLabel, flattenClassTree } from '../admin/ci-classes/classHelpers';

const STATUSES = ['installed', 'in_stock', 'planned', 'maintenance', 'retired'] as const;
const ENVIRONMENTS = ['production', 'staging', 'development', 'test'] as const;

export function CmdbFilterChips({
  classes,
  classFilter,
  statusFilter,
  environmentFilter,
  isActiveFilter,
  canCreate,
  setFilter,
  statusLabel,
}: {
  classes: CIClass[];
  classFilter: string;
  statusFilter: string;
  environmentFilter: string;
  isActiveFilter: string;
  canCreate: boolean;
  setFilter: (key: string, value: string) => void;
  statusLabel: (value: string) => string;
}) {
  const tCmdb = useTranslations('pages.cmdb');
  const classOptions = useMemo(
    () => flattenClassTree(buildClassTree(classes)),
    [classes],
  );
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
    }`;

  return (
    <>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs font-medium text-gray-500" htmlFor="cmdb-class-filter">
          {tCmdb('filters.allTypes')}
        </label>
        <select
          id="cmdb-class-filter"
          value={classFilter}
          onChange={(e) => setFilter('class_id', e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200"
        >
          <option value="">{tCmdb('filters.allTypes')}</option>
          {classOptions.map((node) => (
            <option key={node.cls.id} value={node.cls.id}>
              {classOptionLabel(node.cls.display_name, node.depth)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setFilter('status', '')} className={chip(!statusFilter)}>
          {tCmdb('filters.allStatuses')}
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter('status', s)} className={chip(statusFilter === s)}>
            {statusLabel(s)}
          </button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setFilter('environment', '')} className={chip(!environmentFilter)}>
          {tCmdb('filters.allEnvironments')}
        </button>
        {ENVIRONMENTS.map((env) => (
          <button key={env} onClick={() => setFilter('environment', env)} className={chip(environmentFilter === env)}>
            {statusLabel(env)}
          </button>
        ))}
      </div>
      {canCreate && (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setFilter('is_active', '')} className={chip(!isActiveFilter)}>
            {tCmdb('filters.allActive')}
          </button>
          <button onClick={() => setFilter('is_active', 'true')} className={chip(isActiveFilter === 'true')}>
            {tCmdb('filters.activeOnly')}
          </button>
          <button onClick={() => setFilter('is_active', 'false')} className={chip(isActiveFilter === 'false')}>
            {tCmdb('filters.inactiveOnly')}
          </button>
        </div>
      )}
    </>
  );
}
