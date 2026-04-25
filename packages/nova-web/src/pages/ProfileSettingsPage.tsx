/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { formatDateTime } from '../utils/dateTime';

export default function ProfileSettingsPage() {
  const { user, setTimeFormat, setDateFormat } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const nowSample = formatDateTime(new Date());

  const onChangeTime = async (value: '12h' | '24h') => {
    setError('');
    setSaving(true);
    try {
      await setTimeFormat(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update time format');
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
      setError(err instanceof Error ? err.message : 'Failed to update date format');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Profile Settings"
        description="Personal preferences for date and time display."
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Format</label>
              <select
                value={user.time_format}
                onChange={(e) => onChangeTime(e.target.value === '12h' ? '12h' : '24h')}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
              <select
                value={user.date_format}
                onChange={(e) => onChangeDate((e.target.value as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') || 'YYYY-MM-DD')}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </div>

          <div className="pt-1">
            <p className="block text-sm font-medium text-gray-700 mb-1">Language</p>
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2">
              <LanguageSwitcher variant="on-light-header" showLabel={false} />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              This updates your interface language across devices.
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">Preview</p>
            <p className="text-sm font-medium text-gray-900">{nowSample}</p>
          </div>
        </div>
      </Card>
    </>
  );
}

