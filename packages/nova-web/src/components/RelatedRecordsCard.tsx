/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import {
  recordLinks,
  type RecordLink,
  type RecordLinkEntityType,
  type RecordLinkSearchHit,
  type RecordLinkType,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isAgentRole } from '../utils/roles';
import Card from './Card';
import { Button } from './ui/button';

const ENTITY_TYPES: RecordLinkEntityType[] = [
  'incident',
  'request',
  'problem',
  'change',
  'configuration_item',
  'asset',
];

const LINK_TYPES: RecordLinkType[] = ['related', 'parent', 'duplicate'];

type Props = {
  entityType: RecordLinkEntityType;
  entityId: string;
  readonly?: boolean;
};

export default function RelatedRecordsCard({ entityType, entityId, readonly = false }: Props) {
  const t = useTranslations('components.relatedRecords');
  const { user } = useAuth();
  const canEdit = !readonly && isAgentRole(user?.roles);

  const [links, setLinks] = useState<RecordLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetType, setTargetType] = useState<RecordLinkEntityType>(
    ENTITY_TYPES.find((x) => x !== entityType) || 'incident',
  );
  const [linkType, setLinkType] = useState<RecordLinkType>('related');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RecordLinkSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await recordLinks.list(entityType, entityId);
      setLinks(res.links);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canEdit || query.trim().length < 1) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      recordLinks.search(targetType, query.trim())
        .then((res) => {
          if (!cancelled) {
            setHits(res.results.filter((h) => !(h.entity_type === entityType && h.id === entityId)));
          }
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canEdit, entityId, entityType, query, targetType]);

  const targetOptions = useMemo(
    () => ENTITY_TYPES.filter((x) => x !== entityType),
    [entityType],
  );

  const addLink = async (hit: RecordLinkSearchHit) => {
    setSaving(true);
    setError('');
    try {
      // parent: selected record is the parent of the current entity.
      const payload = linkType === 'parent'
        ? {
          source_type: hit.entity_type,
          source_id: hit.id,
          target_type: entityType,
          target_id: entityId,
          link_type: linkType,
        }
        : {
          source_type: entityType,
          source_id: entityId,
          target_type: hit.entity_type,
          target_id: hit.id,
          link_type: linkType,
        };
      await recordLinks.create(payload);
      setQuery('');
      setHits([]);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      await recordLinks.remove(id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const linkTypeLabel = (link: RecordLink) => {
    if (link.link_type === 'parent') {
      // Badge describes the other record relative to the current one.
      return link.direction === 'outgoing'
        ? t('linkTypes.child')
        : t('linkTypes.parent');
    }
    return t(`linkTypes.${link.link_type}` as 'linkTypes.related');
  };

  const selectCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden';
  const inputCls = selectCls;

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{t('title')}</h3>
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t('loading')}</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">{t('empty')}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    {t(`entities.${link.other_type}` as 'entities.incident')}
                  </span>
                  <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                    {linkTypeLabel(link)}
                  </span>
                </div>
                <Link
                  to={link.other_path}
                  className="text-sm font-medium text-indigo-700 hover:text-indigo-900 truncate block mt-0.5"
                >
                  {link.other_identifier}
                  {link.other_title && link.other_title !== link.other_identifier
                    ? ` — ${link.other_title}`
                    : ''}
                </Link>
                {link.other_status && (
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{link.other_status}</p>
                )}
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => { void removeLink(link.id); }}
                >
                  {t('remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500">{t('add')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('targetType')}</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as RecordLinkEntityType)}
                className={selectCls}
              >
                {targetOptions.map((et) => (
                  <option key={et} value={et}>{t(`entities.${et}` as 'entities.incident')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('linkType')}</label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as RecordLinkType)}
                className={selectCls}
              >
                {LINK_TYPES.map((lt) => (
                  <option key={lt} value={lt}>{t(`linkTypes.${lt}` as 'linkTypes.related')}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('search')}</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className={inputCls}
            />
          </div>
          {searching && <p className="text-xs text-gray-400">{t('searching')}</p>}
          {!searching && query.trim() && hits.length === 0 && (
            <p className="text-xs text-gray-400">{t('noResults')}</p>
          )}
          {hits.length > 0 && (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => { void addLink(hit); }}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    <span className="text-sm font-medium text-gray-900">{hit.identifier}</span>
                    {hit.title && hit.title !== hit.identifier && (
                      <span className="text-sm text-gray-600"> — {hit.title}</span>
                    )}
                    {hit.status && (
                      <span className="block text-xs text-gray-400 capitalize mt-0.5">{hit.status}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {linkType === 'parent' && (
            <p className="text-xs text-gray-500">{t('parentHint')}</p>
          )}
        </div>
      )}
    </Card>
  );
}
