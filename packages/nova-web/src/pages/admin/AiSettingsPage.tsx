/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { settings as settingsApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

const AI_KEYS = [
  'ai_triage_on_create',
  'ai_auto_apply_priority',
  'ess_auto_deflect',
  'ess_deflect_confidence_threshold',
] as const;

type AiForm = Record<(typeof AI_KEYS)[number], string>;

const DEFAULTS: AiForm = {
  ai_triage_on_create: 'true',
  ai_auto_apply_priority: 'false',
  ess_auto_deflect: 'false',
  ess_deflect_confidence_threshold: '0.65',
};

function asBool(v: string): boolean {
  return v === 'true' || v === '1' || v === 'yes';
}

export default function AiSettingsPage() {
  const t = useTranslations('pages.admin.aiSettings');
  const tActions = useTranslations('common.actions');
  const [form, setForm] = useState<AiForm>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsApi.get().then((res) => {
      const next = { ...DEFAULTS };
      for (const key of AI_KEYS) {
        if (typeof res.settings[key] === 'string' && res.settings[key]) {
          next[key] = res.settings[key];
        }
      }
      setForm(next);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const setBool = (key: keyof AiForm, value: boolean) => {
    setForm((prev) => ({ ...prev, [key]: value ? 'true' : 'false' }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await settingsApi.update(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card>
        <div className="space-y-5 max-w-xl">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={asBool(form.ai_triage_on_create)}
              onChange={(e) => setBool('ai_triage_on_create', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t('triageOnCreate')}</span>
              <span className="block text-xs text-gray-500">{t('triageOnCreateHelp')}</span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={asBool(form.ai_auto_apply_priority)}
              onChange={(e) => setBool('ai_auto_apply_priority', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t('autoApplyPriority')}</span>
              <span className="block text-xs text-gray-500">{t('autoApplyPriorityHelp')}</span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={asBool(form.ess_auto_deflect)}
              onChange={(e) => setBool('ess_auto_deflect', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t('essAutoDeflect')}</span>
              <span className="block text-xs text-gray-500">{t('essAutoDeflectHelp')}</span>
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ess-deflect-threshold">
              {t('deflectThreshold')}
            </label>
            <input
              id="ess-deflect-threshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.ess_deflect_confidence_threshold}
              onChange={(e) => setForm((prev) => ({
                ...prev,
                ess_deflect_confidence_threshold: e.target.value,
              }))}
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
            />
            <p className="mt-1 text-xs text-gray-500">{t('deflectThresholdHelp')}</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? tActions('saving') : tActions('save')}
            </button>
            {saved && <span className="text-sm text-green-600">{t('saved')}</span>}
          </div>
        </div>
      </Card>
    </>
  );
}
