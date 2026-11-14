/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { emailSignatures } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { formatDateTime } from '../utils/dateTime';

export default function ProfileSettingsPage() {
  const { user, setTimeFormat, setDateFormat } = useAuth();
  const tProfile = useTranslations('pages.profile');
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [signatureBody, setSignatureBody] = useState<string | null>(null);
  const [signatureStatus, setSignatureStatus] = useState('');

  const signatureQuery = useQuery({
    queryKey: ['email-signature', 'me'],
    queryFn: () => emailSignatures.me().then((r) => r.signature),
  });

  if (!user) return null;

  const nowSample = formatDateTime(new Date());
  const signatureValue = signatureBody ?? signatureQuery.data?.body ?? '';

  const onChangeTime = async (value: '12h' | '24h') => {
    setError('');
    setSaving(true);
    try {
      await setTimeFormat(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : tProfile('updateTimeFormatFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onChangeDate = async (value: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') => {
    setError('');
    setSaving(true);
    try {
      await setDateFormat(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : tProfile('updateDateFormatFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onSaveSignature = async () => {
    setError('');
    setSignatureStatus('');
    setSaving(true);
    try {
      await emailSignatures.saveMe(signatureValue);
      setSignatureBody(null);
      await queryClient.invalidateQueries({ queryKey: ['email-signature', 'me'] });
      setSignatureStatus(tProfile('signatureSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : tProfile('updateSignatureFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={tProfile('title')}
        description={tProfile('description')}
      />

      <Card className="max-w-2xl">
        <div className="space-y-5">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tProfile('timeFormat')}</label>
              <select
                value={user.time_format}
                onChange={(e) => onChangeTime(e.target.value === '12h' ? '12h' : '24h')}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="24h">{tProfile('timeFormat24h')}</option>
                <option value="12h">{tProfile('timeFormat12h')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tProfile('dateFormat')}</label>
              <select
                value={user.date_format}
                onChange={(e) => onChangeDate((e.target.value as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') || 'YYYY-MM-DD')}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </div>

          <div className="pt-1">
            <p className="block text-sm font-medium text-gray-700 mb-1">{tProfile('language')}</p>
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2">
              <LanguageSwitcher variant="on-light-header" showLabel={false} />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {tProfile('languageHint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email-signature">
              {tProfile('emailSignature')}
            </label>
            <textarea
              id="email-signature"
              value={signatureValue}
              onChange={(e) => {
                setSignatureBody(e.target.value);
                setSignatureStatus('');
              }}
              rows={4}
              placeholder={tProfile('emailSignaturePlaceholder')}
              disabled={saving || signatureQuery.isLoading}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
            />
            <p className="mt-1 text-xs text-gray-500">{tProfile('emailSignatureHint')}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void onSaveSignature()}
                disabled={saving}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {tProfile('saveSignature')}
              </button>
              {signatureStatus && <span className="text-xs text-green-700">{signatureStatus}</span>}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">{tProfile('preview')}</p>
            <p className="text-sm font-medium text-gray-900">{nowSample}</p>
          </div>
        </div>
      </Card>
    </>
  );
}
