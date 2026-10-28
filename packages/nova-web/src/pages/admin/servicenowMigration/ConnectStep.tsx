/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import Card from '../../../components/Card';
import { credentials, migrations } from '../../../api/client';
import type { ServiceNowProbeResult, TenantCredentialListItem } from '../../../api/client';
import { errorMessage, inputClass, primaryButton, secondaryButton } from './shared';

export default function ConnectStep(props: {
  instanceUrl: string;
  setInstanceUrl: (v: string) => void;
  credentialSlug: string;
  setCredentialSlug: (v: string) => void;
  onConnected: () => void;
}) {
  const t = useTranslations('pages.admin.serviceNowMigration.connect');
  const [creds, setCreds] = useState<TenantCredentialListItem[] | null>(null);
  const [probe, setProbe] = useState<ServiceNowProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    credentials.list().then((r) => setCreds(r.credentials)).catch(() => setCreds([]));
  }, []);

  const test = async () => {
    setTesting(true);
    setError('');
    setProbe(null);
    try {
      setProbe(await migrations.serviceNowTestConnection({
        instance_url: props.instanceUrl.trim(),
        credential_slug: props.credentialSlug,
      }));
    } catch (err) {
      setError(errorMessage(err, t('failed')));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('instanceUrl')}</label>
          <input
            value={props.instanceUrl}
            onChange={(e) => { props.setInstanceUrl(e.target.value); setProbe(null); }}
            placeholder={t('instancePlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('credential')}</label>
          <select
            value={props.credentialSlug}
            onChange={(e) => { props.setCredentialSlug(e.target.value); setProbe(null); }}
            className={inputClass}
          >
            <option value="">{t('credentialPlaceholder')}</option>
            {(creds ?? []).map((c) => (
              <option key={c.id} value={c.slug}>{c.label} ({c.slug})</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{creds && creds.length === 0 ? t('noCredentials') : t('credentialHint')}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          className={secondaryButton}
          disabled={testing || !props.instanceUrl.trim() || !props.credentialSlug}
          onClick={() => void test()}
        >
          {testing ? t('testing') : t('test')}
        </button>
        <button type="button" className={primaryButton} disabled={!probe?.ok} onClick={props.onConnected}>
          {t('continue')}
        </button>
      </div>
      {error && <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {probe && (
        <div className="mt-4 space-y-3">
          <div className={`px-4 py-3 rounded-lg text-sm border ${probe.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {probe.ok ? t('ok', { instance: probe.instanceUrl, release: probe.release ?? '?' }) : t('failed')}
            <p className="text-xs mt-1">{t('flowStorage', { storage: probe.flowStorage, encoding: probe.valueEncoding })}</p>
            {probe.messages.map((m) => <p key={m} className="text-xs mt-1">{m}</p>)}
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">{t('table')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{t('access')}</th>
                  <th className="text-right px-3 py-1.5 font-medium">{t('rows')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {probe.tables.map((tb) => (
                  <tr key={tb.table}>
                    <td className="px-3 py-1 font-mono">{tb.table}</td>
                    <td className={`px-3 py-1 ${tb.ok ? 'text-green-700' : 'text-red-700'}`}>{tb.ok ? 'OK' : tb.status}</td>
                    <td className="px-3 py-1 text-right">{tb.total ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

