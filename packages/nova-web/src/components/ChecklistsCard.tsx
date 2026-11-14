/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  checklists as checklistsApi,
  type ChecklistEntityType,
  type ChecklistInstance,
  type ChecklistInstanceItem,
} from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import { formatDateTime } from '@/utils/dateTime';
import Card from './Card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

type Props = {
  entityType: ChecklistEntityType;
  entityId: string;
  readonly?: boolean;
};

export default function ChecklistsCard({ entityType, entityId, readonly = false }: Props) {
  const t = useTranslations('components.checklists');
  const tActions = useTranslations('common.actions');
  const { user } = useAuth();
  const canEdit = !readonly && isAgentRole(user?.roles);
  const queryClient = useQueryClient();
  const instancesKey = ['checklists', entityType, entityId] as const;
  const templatesKey = ['checklist-templates', entityType] as const;

  const [applyOpen, setApplyOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const instancesQuery = useQuery({
    queryKey: instancesKey,
    queryFn: () => checklistsApi.listInstances(entityType, entityId),
  });

  const templatesQuery = useQuery({
    queryKey: templatesKey,
    queryFn: () => checklistsApi.listTemplates(entityType),
    enabled: applyOpen && canEdit,
  });

  const instances = instancesQuery.data?.checklist_instances ?? [];
  const templates = templatesQuery.data?.checklist_templates ?? [];
  const appliedIds = useMemo(
    () => new Set(instances.map((i) => i.template_id).filter(Boolean)),
    [instances],
  );
  const availableTemplates = templates.filter((tpl) => !appliedIds.has(tpl.id));

  const loadError = instancesQuery.error instanceof Error
    ? instancesQuery.error.message
    : instancesQuery.error
      ? t('loadFailed')
      : '';

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: instancesKey });
  }

  function patchItemInCache(itemId: string, patch: Partial<ChecklistInstanceItem>) {
    queryClient.setQueryData<{ checklist_instances: ChecklistInstance[] }>(instancesKey, (prev) => {
      if (!prev) return prev;
      return {
        checklist_instances: prev.checklist_instances.map((instance) => {
          const items = instance.items.map((item) => (
            item.id === itemId ? { ...item, ...patch } : item
          ));
          return {
            ...instance,
            items,
            open_required_count: items.filter((i) => i.required && !i.is_done).length,
          };
        }),
      };
    });
  }

  async function toggleItem(itemId: string, next: boolean) {
    if (!canEdit || busyId === itemId) return;
    setBusyId(itemId);
    setActionError('');
    const previous = instances
      .flatMap((instance) => instance.items)
      .find((item) => item.id === itemId);
    patchItemInCache(itemId, {
      is_done: next,
      done_at: next ? new Date().toISOString() : null,
      done_by_name: next ? (user?.display_name || user?.email || t('unknownUser')) : null,
    });
    try {
      const updated = await checklistsApi.setItemDone(itemId, next);
      patchItemInCache(itemId, updated);
      await refresh();
    } catch (err) {
      if (previous) {
        patchItemInCache(itemId, {
          is_done: previous.is_done,
          done_at: previous.done_at,
          done_by: previous.done_by,
          done_by_name: previous.done_by_name,
        });
      }
      setActionError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function applyTemplate() {
    if (!templateId) return;
    setBusyId('apply');
    setActionError('');
    try {
      await checklistsApi.apply({
        entity_type: entityType,
        entity_id: entityId,
        template_id: templateId,
      });
      setApplyOpen(false);
      setTemplateId('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('applyFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeInstance(instance: ChecklistInstance) {
    if (!window.confirm(t('removeConfirm', { name: instance.template_name }))) return;
    setBusyId(instance.id);
    setActionError('');
    try {
      await checklistsApi.removeInstance(instance.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('removeFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div id="entity-checklists" className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
          {instances.some((i) => i.open_required_count > 0) && (
            <p className="mt-1 text-xs text-amber-700">{t('requiredOpenHint')}</p>
          )}
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setApplyOpen((v) => !v)}>
            {applyOpen ? tActions('cancel') : t('apply')}
          </Button>
        )}
      </div>

      {(actionError || loadError) && (
        <p className="mt-3 text-sm text-red-600">{actionError || loadError}</p>
      )}

      {applyOpen && canEdit && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <label className="block text-sm font-medium text-gray-800">
            {t('selectTemplate')}
            <select
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">{t('selectPlaceholder')}</option>
              {availableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.items.length})
                </option>
              ))}
            </select>
          </label>
          {availableTemplates.length === 0 && (
            <p className="text-xs text-gray-500">{t('noTemplates')}</p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!templateId || busyId === 'apply'}
            onClick={applyTemplate}
          >
            {busyId === 'apply' ? t('applying') : t('applyConfirm')}
          </Button>
        </div>
      )}

      {instancesQuery.isLoading ? (
        <p className="mt-3 text-sm text-gray-500">{t('loading')}</p>
      ) : instances.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{t('empty')}</p>
      ) : (
        <div className="mt-4 space-y-5">
          {instances.map((instance) => (
            <div key={instance.id} className="border-t border-gray-100 pt-4 first:border-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{instance.template_name}</p>
                  {instance.open_required_count > 0 && (
                    <p className="text-xs text-amber-700">
                      {t('openRequired', { count: instance.open_required_count })}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === instance.id}
                    onClick={() => removeInstance(instance)}
                  >
                    {t('remove')}
                  </Button>
                )}
              </div>
              <ul className="mt-3 space-y-2">
                {instance.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!canEdit || busyId === item.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggleItem(item.id, !item.is_done);
                      }}
                      className="flex w-full items-start gap-3 rounded-md px-1 py-1 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Checkbox
                        checked={item.is_done}
                        disabled={!canEdit || busyId === item.id}
                        // Visual only — the row button owns the click to avoid form/label side effects.
                        tabIndex={-1}
                        className="mt-0.5 pointer-events-none"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={[
                          'text-sm',
                          item.is_done ? 'text-gray-500 line-through' : 'text-gray-800',
                        ].join(' ')}>
                          {item.label}
                          {item.required && (
                            <span className="ml-1 text-xs text-amber-700">{t('required')}</span>
                          )}
                        </span>
                        {item.is_done && item.done_at && (
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {t('doneBy', {
                              name: item.done_by_name || t('unknownUser'),
                              when: formatDateTime(item.done_at),
                            })}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
