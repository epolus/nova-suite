/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { SlaDefinition } from '../../../api/client';
import Card from '../../../components/Card';
import { PROCESS_COLORS, WARNING_ACTION_KEYS, BREACH_ACTION_KEYS } from './constants';

interface SlaListProps {
  definitions: SlaDefinition[];
  onEdit: (def: SlaDefinition) => void;
  onToggleActive: (def: SlaDefinition) => void;
  onDelete: (def: SlaDefinition) => void;
}

export default function SlaList({ definitions, onEdit, onToggleActive, onDelete }: SlaListProps) {
  const t = useTranslations('pages.admin.slaConfig');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const tImpact = useTranslations('impact');
  const tUrgency = useTranslations('urgency');

  const priorityLabel = useCallback(
    (p: number) => t(`priorities.p${p}` as 'priorities.p1'),
    [t],
  );

  const warningActionLabel = useCallback(
    (actionId: string) => {
      const key = WARNING_ACTION_KEYS[actionId];
      return key ? t(`warningActions.${key}.label` as 'warningActions.notifyAssignee.label') : actionId.replace(/_/g, ' ');
    },
    [t],
  );

  const breachActionLabel = useCallback(
    (actionId: string) => {
      const key = BREACH_ACTION_KEYS[actionId];
      return key ? t(`breachActions.${key}.label` as 'breachActions.notifyAssignee.label') : actionId.replace(/_/g, ' ');
    },
    [t],
  );

  return (
    <div className="space-y-3">
      {definitions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {t('empty')}
        </div>
      ) : (
        definitions.map((def) => (
          <Card
            key={def.id}
            className={`transition-opacity ${!def.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{def.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROCESS_COLORS[def.process_type]}`}>
                    {t(`processTypes.${def.process_type}` as 'processTypes.incident')}
                  </span>
                  {!def.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{tStates('inactive')}</span>
                  )}
                </div>
                {def.description && (
                  <p className="text-sm text-gray-500 mt-1">{def.description}</p>
                )}

                {/* Conditions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {def.condition_priority && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {t('list.conditionPriority', { value: priorityLabel(def.condition_priority) })}
                    </span>
                  )}
                  {def.condition_impact && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {t('list.conditionImpact', { value: tImpact(def.condition_impact as 'high') })}
                    </span>
                  )}
                  {def.condition_urgency && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {t('list.conditionUrgency', { value: tUrgency(def.condition_urgency as 'high') })}
                    </span>
                  )}
                  {def.condition_service_name && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {t('list.conditionService', { value: def.condition_service_name })}
                    </span>
                  )}
                  {def.condition_category && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {t('list.conditionCategory', { value: def.condition_category })}
                    </span>
                  )}
                </div>

                {/* Timing */}
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t('list.resolution')} <strong>{def.resolution_hours}h</strong>
                  </span>
                  {def.response_hours && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {t('list.response')} <strong>{def.response_hours}h</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    {t('list.warningAt')} <strong>{def.warning_pct}%</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                    </svg>
                    {t('list.autoCloseAfter')} <strong>{def.auto_close_days ?? 7}d</strong>
                  </span>
                </div>

                {/* Actions summary */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {Array.isArray(def.on_warning) && def.on_warning.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-yellow-700">{t('list.onWarning')}</span>
                      {def.on_warning.map((a) => (
                        <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">
                          {warningActionLabel(a)}
                        </span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(def.on_breach) && def.on_breach.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-red-700">{t('list.onBreach')}</span>
                      {def.on_breach.map((a) => (
                        <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          {breachActionLabel(a)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(def)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title={tActions('edit')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onToggleActive(def)}
                  className={`p-2 rounded-lg transition-colors ${
                    def.is_active
                      ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                      : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                  }`}
                  title={def.is_active ? t('deactivate') : t('activate')}
                >
                  {def.is_active ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => onDelete(def)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={tActions('delete')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
