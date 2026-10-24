/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';

export type FilterPreset<T> = T & { id: string; name: string };

interface FilterPresetsBarProps<T> {
  /** Legacy localStorage key; also names the user preference scope. */
  storageKey: string;
  /** Filter state saved with a new preset. */
  current: T;
  hasActiveFilter: boolean;
  onApply: (preset: FilterPreset<T>) => void;
}

export default function FilterPresetsBar<T extends object>({
  storageKey,
  current,
  hasActiveFilter,
  onApply,
}: FilterPresetsBarProps<T>) {
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
  const [presets, setPresets] = useUserPreferenceState<FilterPreset<T>[]>(`presets:${storageKey}`, [], storageKey);
  const [draftName, setDraftName] = useState<string | null>(null);

  if (presets.length === 0 && !hasActiveFilter) return null;

  const save = () => {
    const name = draftName?.trim();
    if (!name) return;
    setPresets([...presets, { ...current, id: crypto.randomUUID(), name }]);
    setDraftName(null);
  };

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span className="text-xs font-medium text-gray-400">{tFilters('saved')}</span>
      {presets.map((preset) => (
        <div key={preset.id} className="flex items-center gap-0.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700">
          <button onClick={() => onApply(preset)} className="hover:text-indigo-600 transition-colors">{preset.name}</button>
          <button onClick={() => setPresets(presets.filter((p) => p.id !== preset.id))} className="ml-1 text-gray-300 hover:text-red-500 transition-colors leading-none">&#10005;</button>
        </div>
      ))}
      {draftName !== null ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraftName(null); }}
            placeholder={tFilters('filterNamePlaceholder')}
            className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-hidden focus:ring-1 focus:ring-indigo-400 w-36"
          />
          <button onClick={save} disabled={!draftName.trim()} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">{tActions('save')}</button>
          <button onClick={() => setDraftName(null)} className="text-xs text-gray-400 hover:text-gray-600">{tActions('cancel')}</button>
        </div>
      ) : hasActiveFilter && (
        <button
          onClick={() => setDraftName('')}
          className="px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          + {tFilters('saveCurrent')}
        </button>
      )}
    </div>
  );
}
