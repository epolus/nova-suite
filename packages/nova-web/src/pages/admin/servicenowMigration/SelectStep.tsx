/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import Card from '../../../components/Card';
import Spinner from '../../../components/Spinner';
import { migrations } from '../../../api/client';
import type { ServiceNowCatalogBrowse } from '../../../api/client';
import { errorMessage, inputClass, primaryButton } from './shared';

export default function SelectStep(props: {
  instanceUrl: string;
  credentialSlug: string;
  onStarted: (runId: string) => void;
}) {
  const t = useTranslations('pages.admin.serviceNowMigration.select');
  const [browse, setBrowse] = useState<ServiceNowCatalogBrowse | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeProducers, setIncludeProducers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    migrations.serviceNowCatalogs({ instance_url: props.instanceUrl.trim(), credential_slug: props.credentialSlug })
      .then(setBrowse)
      .catch((err) => setError(errorMessage(err, 'Failed to load catalog')));
  }, [props.instanceUrl, props.credentialSlug]);

  const categoryName = useMemo(() => {
    const byId = new Map((browse?.categories ?? []).map((c) => [c.sys_id, c]));
    return (id: string) => {
      const names: string[] = [];
      let cur = byId.get(id);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.sys_id)) {
        seen.add(cur.sys_id);
        names.unshift(cur.title);
        cur = cur.parent ? byId.get(cur.parent) : undefined;
      }
      return names.join(' / ');
    };
  }, [browse]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (browse?.items ?? []).filter((i) =>
      (includeInactive || i.active)
      && (includeProducers || !i.record_producer)
      && (!categoryId || i.category === categoryId)
      && (!q || i.name.toLowerCase().includes(q) || i.short_description.toLowerCase().includes(q)));
  }, [browse, search, categoryId, includeInactive, includeProducers]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const run = await migrations.serviceNowStartRun(
        { instance_url: props.instanceUrl.trim(), credential_slug: props.credentialSlug },
        {
          itemIds: [...selected],
          includeInactive,
          includeRecordProducers: includeProducers,
          maxItems: Math.min(2000, Math.max(1, selected.size)),
        },
      );
      props.onStarted(run.id);
    } catch (err) {
      setError(errorMessage(err, 'Failed to start'));
    } finally {
      setStarting(false);
    }
  };

  if (error && !browse) return <Card><div className="text-sm text-red-700">{error}</div></Card>;
  if (!browse) return <Card><Spinner /><p className="text-sm text-gray-500 text-center">{t('loading')}</p></Card>;

  return (
    <Card>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className={`${inputClass} max-w-xs`} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} max-w-xs`}>
          <option value="">{t('allCategories')}</option>
          {browse.categories
            .map((c) => ({ id: c.sys_id, name: categoryName(c.sys_id) }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          {t('includeInactive')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeProducers} onChange={(e) => setIncludeProducers(e.target.checked)} />
          {t('includeProducers')}
        </label>
      </div>
      {browse.truncated && <p className="text-xs text-amber-700 mb-2">{t('truncated')}</p>}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          className="text-xs text-indigo-600 hover:underline"
          onClick={() => setSelected((prev) => new Set([...prev, ...visible.map((i) => i.sys_id)]))}
        >
          {t('selectAllVisible')}
        </button>
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setSelected(new Set())}>
          {t('clear')}
        </button>
        <span className="text-xs text-gray-500 ml-auto">{t('selected', { count: selected.size })}</span>
      </div>
      <div className="overflow-y-auto max-h-[28rem] border border-gray-100 rounded-lg divide-y divide-gray-100">
        {visible.map((i) => (
          <label key={i.sys_id} className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={selected.has(i.sys_id)} onChange={() => toggle(i.sys_id)} />
            <span className="flex-1 min-w-0">
              <span className="font-medium text-gray-900">{i.name}</span>
              {!i.active && <span className="ml-2 text-xs text-gray-400">({t('inactive')})</span>}
              <span className="block text-xs text-gray-500 truncate">{categoryName(i.category)}{i.short_description ? ` — ${i.short_description}` : ''}</span>
            </span>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {i.has_flow ? t('flow') : i.has_legacy_workflow ? t('legacy') : t('none')}
            </span>
          </label>
        ))}
      </div>
      {error && <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      <div className="mt-4">
        <button type="button" className={primaryButton} disabled={selected.size === 0 || starting} onClick={() => void start()}>
          {starting ? t('starting') : t('start', { count: selected.size })}
        </button>
      </div>
    </Card>
  );
}

