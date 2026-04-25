/* SPDX-License-Identifier: AGPL-3.0-only */
import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../api/client';

export type SortDir = 'asc' | 'desc';

export interface ListParams {
  search: string;
  sort: string;
  dir: SortDir;
  cols: string[];
  page: number;
  filters: Record<string, string>;
  columnFilters: Record<string, string>;
}

interface SavedPrefs {
  cols?: string[];
  sort?: string;
  dir?: SortDir;
}

function prefsKey(storageKey: string): string {
  try {
    const raw = localStorage.getItem('nova_token');
    if (raw) {
      const payload = JSON.parse(atob(raw.split('.')[1]!));
      return `nova_list_${payload.sub || payload.id || 'anon'}_${storageKey}`;
    }
  } catch { /* ignore */ }
  return `nova_list_anon_${storageKey}`;
}

function loadPrefs(storageKey: string | undefined): SavedPrefs | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(prefsKey(storageKey));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePrefs(storageKey: string | undefined, prefs: SavedPrefs) {
  if (!storageKey) return;
  try {
    localStorage.setItem(prefsKey(storageKey), JSON.stringify(prefs));
  } catch { /* quota etc */ }
}

interface UseListParamsOptions {
  defaultCols: string[];
  filterKeys?: string[];
  prefix?: string;
  storageKey?: string;
}

const CF_PREFIX = 'cf.';

export function useListParams({ defaultCols, filterKeys = [], prefix = '', storageKey }: UseListParamsOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const p = (key: string) => `${prefix}${key}`;
  const [savedPrefs, setSavedPrefs] = useState<SavedPrefs | null>(() => loadPrefs(storageKey));

  useEffect(() => {
    if (!storageKey) return;
    const scope = `list:${storageKey}`;
    let alive = true;
    auth.getPreference(scope)
      .then((res) => {
        if (!alive || !res.preference) return;
        const pref = res.preference as SavedPrefs;
        setSavedPrefs(pref);
        savePrefs(storageKey, pref);
      })
      .catch(() => {
        // Keep local fallback if backend preference is unavailable.
      });
    return () => { alive = false; };
  }, [storageKey]);

  const params: ListParams = useMemo(() => {
    const colsRaw = searchParams.get(p('cols'));
    const urlSort = searchParams.get(p('sort'));
    const saved = savedPrefs;

    let cols: string[];
    if (colsRaw) {
      cols = colsRaw.split(',').filter(Boolean);
    } else if (saved?.cols) {
      cols = saved.cols;
    } else {
      cols = defaultCols;
    }

    let sort = '';
    let dir: SortDir = 'asc';
    if (urlSort) {
      sort = urlSort;
      dir = (searchParams.get(p('dir')) as SortDir) || 'asc';
    } else if (saved?.sort) {
      sort = saved.sort;
      dir = saved.dir || 'asc';
    }

    const columnFilters: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      const cfKey = prefix ? `${prefix}${CF_PREFIX}` : CF_PREFIX;
      if (key.startsWith(cfKey)) {
        columnFilters[key.slice(cfKey.length)] = val;
      }
    });

    return {
      search: searchParams.get(p('search')) || '',
      sort,
      dir,
      cols,
      page: Math.max(1, parseInt(searchParams.get(p('page')) || '1', 10) || 1),
      filters: filterKeys.reduce<Record<string, string>>((acc, key) => {
        const val = searchParams.get(p(key));
        if (val) acc[key] = val;
        return acc;
      }, {}),
      columnFilters,
    };
  }, [searchParams, defaultCols, filterKeys, prefix, savedPrefs]);

  const update = useCallback(
    (patch: Partial<ListParams>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);

        if (patch.search !== undefined) {
          if (patch.search) next.set(p('search'), patch.search);
          else next.delete(p('search'));
        }

        if (patch.sort !== undefined) {
          if (patch.sort) next.set(p('sort'), patch.sort);
          else { next.delete(p('sort')); next.delete(p('dir')); }
        }

        if (patch.dir !== undefined && next.has(p('sort'))) {
          next.set(p('dir'), patch.dir);
        }

        if (patch.cols !== undefined) {
          const colStr = patch.cols.join(',');
          const defaultStr = defaultCols.join(',');
          if (colStr === defaultStr) next.delete(p('cols'));
          else next.set(p('cols'), colStr);
        }

        if (patch.page !== undefined) {
          if (patch.page > 1) next.set(p('page'), String(patch.page));
          else next.delete(p('page'));
        }

        if (patch.filters !== undefined) {
          for (const key of filterKeys) {
            const val = patch.filters[key];
            if (val) next.set(p(key), val);
            else next.delete(p(key));
          }
        }

        if (patch.columnFilters !== undefined) {
          const cfKey = prefix ? `${prefix}${CF_PREFIX}` : CF_PREFIX;
          // Remove old cf. entries
          const toRemove: string[] = [];
          next.forEach((_, key) => { if (key.startsWith(cfKey)) toRemove.push(key); });
          toRemove.forEach((k) => next.delete(k));
          // Set new ones
          for (const [col, val] of Object.entries(patch.columnFilters)) {
            if (val) next.set(`${cfKey}${col}`, val);
          }
        }

        return next;
      }, { replace: true });

      // Persist cols & sort to localStorage and backend user preferences.
      if (storageKey && (patch.cols !== undefined || patch.sort !== undefined || patch.dir !== undefined)) {
        const current = loadPrefs(storageKey) || {};
        if (patch.cols !== undefined) current.cols = patch.cols;
        if (patch.sort !== undefined) current.sort = patch.sort;
        if (patch.dir !== undefined) current.dir = patch.dir;
        savePrefs(storageKey, current);
        setSavedPrefs(current);
        void auth.setPreference(`list:${storageKey}`, current as Record<string, unknown>).catch(() => {
          // Silent fallback to local storage.
        });
      }
    },
    [setSearchParams, defaultCols, filterKeys, prefix, storageKey],
  );

  const setSearch = useCallback(
    (v: string) => update({ search: v, page: 1 }),
    [update],
  );

  const setSort = useCallback(
    (key: string) => {
      if (params.sort === key) {
        if (params.dir === 'asc') update({ dir: 'desc' });
        else update({ sort: '', dir: 'asc' });
      } else {
        update({ sort: key, dir: 'asc' });
      }
    },
    [params.sort, params.dir, update],
  );

  const setCols = useCallback(
    (cols: string[]) => update({ cols }),
    [update],
  );

  const setPage = useCallback(
    (page: number) => update({ page }),
    [update],
  );

  const setFilter = useCallback(
    (key: string, value: string) =>
      update({ filters: { ...params.filters, [key]: value }, page: 1 }),
    [update, params.filters],
  );

  const setColumnFilter = useCallback(
    (col: string, value: string) =>
      update({ columnFilters: { ...params.columnFilters, [col]: value }, page: 1 }),
    [update, params.columnFilters],
  );

  return { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update };
}
