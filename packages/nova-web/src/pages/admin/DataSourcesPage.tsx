/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  dataSources as api,
  credentials as credentialsApi,
  type DataSource,
  type DataSourceRun,
  type DataSourceTestResult,
  type EntityFieldDef,
  type TenantCredentialListItem,
} from '../../api/client';
import Spinner from '../../components/Spinner';
import DataSourceListView from './data-sources/DataSourceListView';
import DataSourceDetailView from './data-sources/DataSourceDetailView';
import DataSourceFormView from './data-sources/DataSourceFormView';
import {
  type FormData,
  EMPTY_FORM,
  buildSaveSourceConfig,
  buildTestSourceConfig,
} from './data-sources/dataSourceForm';

export default function DataSourcesPage() {
  const t = useTranslations('pages.admin.dataSources');

  const [sources, setSources] = useState<DataSource[]>([]);
  const [entities, setEntities] = useState<EntityFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedDs, setSelectedDs] = useState<DataSource | null>(null);
  const [runs, setRuns] = useState<DataSourceRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [testingSource, setTestingSource] = useState(false);
  const [testError, setTestError] = useState('');
  const [testResult, setTestResult] = useState<DataSourceTestResult | null>(null);
  const [vaultCreds, setVaultCreds] = useState<TenantCredentialListItem[]>([]);

  const loadSources = useCallback(async () => {
    try {
      const [{ data_sources }, { entities: ents }, vaultRes] = await Promise.all([
        api.list(),
        api.entityTypes(),
        credentialsApi.list().catch(() => ({ credentials: [] as TenantCredentialListItem[] })),
      ]);
      setSources(data_sources);
      setEntities(ents);
      setVaultCreds(vaultRes.credentials);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setView('form');
  };

  const openEdit = (ds: DataSource) => {
    setEditId(ds.id);
    const cfg = ds.source_config;
    setForm({
      name: ds.name,
      description: ds.description || '',
      entity_type: ds.entity_type,
      source_type: ds.source_type,
      url: cfg.url || '',
      headers: cfg.headers ? JSON.stringify(cfg.headers, null, 2) : '',
      json_path: cfg.json_path || '',
      schedule_cron: ds.schedule_cron,
      schedule_enabled: ds.schedule_enabled,
      import_mode: ds.import_mode,
      upsert_key: ds.upsert_key || '',
      column_mapping: JSON.stringify(ds.column_mapping || {}, null, 2),
      auth_type: cfg.auth_type || 'none',
      bearer_token: cfg.bearer_token || '',
      oauth2_token_url: cfg.oauth2_token_url || '',
      oauth2_client_id: cfg.oauth2_client_id || '',
      oauth2_client_secret: cfg.oauth2_client_secret || '',
      oauth2_scope: cfg.oauth2_scope || '',
      credential_slug: (cfg as { credential_slug?: string }).credential_slug || '',
      pagination_enabled: cfg.pagination?.enabled === true,
      pagination_mode: cfg.pagination?.mode === 'offset' ? 'offset' : 'page',
      pagination_page_param: cfg.pagination?.page_param || 'page',
      pagination_page_start: String(cfg.pagination?.page_start ?? 1),
      pagination_page_size_param: cfg.pagination?.page_size_param || 'limit',
      pagination_page_size: String(cfg.pagination?.page_size ?? 100),
      pagination_offset_param: cfg.pagination?.offset_param || 'offset',
      pagination_offset_start: String(cfg.pagination?.offset_start ?? 0),
      pagination_limit_param: cfg.pagination?.limit_param || 'limit',
      pagination_limit: String(cfg.pagination?.limit ?? 100),
      pagination_max_pages: String(cfg.pagination?.max_pages ?? 20),
      sftp_host: cfg.sftp_host || '',
      sftp_port: String(cfg.sftp_port || 22),
      sftp_username: cfg.sftp_username || '',
      sftp_password: cfg.sftp_password || '',
      sftp_private_key: cfg.sftp_private_key || '',
      sftp_path: cfg.sftp_path || '',
      sftp_file_type: cfg.sftp_file_type || 'csv',
      csv_delimiter: cfg.csv_delimiter || 'auto',
      csv_has_headers: cfg.csv_has_headers !== false,
    });
    setView('form');
  };

  const openDetail = async (ds: DataSource) => {
    setSelectedDs(ds);
    setView('detail');
    setRunsLoading(true);
    try {
      const { runs: r } = await api.runs(ds.id);
      setRuns(r);
    } finally {
      setRunsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let headers: Record<string, string> = {};
      try { if (form.headers.trim()) headers = JSON.parse(form.headers); } catch { /* ignore */ }

      let columnMapping: Record<string, string | string[]> = {};
      try { if (form.column_mapping.trim()) columnMapping = JSON.parse(form.column_mapping); } catch { /* ignore */ }

      const sourceConfig = buildSaveSourceConfig(form, headers);

      const payload = {
        name: form.name,
        description: form.description || null,
        entity_type: form.entity_type,
        source_type: form.source_type,
        source_config: sourceConfig,
        column_mapping: columnMapping,
        schedule_cron: form.schedule_cron,
        schedule_enabled: form.schedule_enabled,
        import_mode: form.import_mode,
        upsert_key: form.import_mode === 'upsert' && form.upsert_key ? form.upsert_key : null,
      };

      if (editId) {
        await api.update(editId, payload as Partial<DataSource>);
      } else {
        await api.create(payload as Partial<DataSource>);
      }

      await loadSources();
      setView('list');
      setTestResult(null);
      setTestError('');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSource = async () => {
    setTestingSource(true);
    setTestError('');
    setTestResult(null);
    try {
      let headers: Record<string, string> = {};
      try { if (form.headers.trim()) headers = JSON.parse(form.headers); } catch { /* ignore */ }

      const sourceConfig = buildTestSourceConfig(form, headers);

      const { result } = await api.testSource({
        entity_type: form.entity_type,
        source_type: form.source_type as DataSource['source_type'],
        source_config: sourceConfig as DataSource['source_config'],
      });
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('testFailed'));
    } finally {
      setTestingSource(false);
    }
  };

  const applySuggestedMapping = () => {
    if (!testResult || Object.keys(testResult.suggested_mapping).length === 0) return;
    setField('column_mapping', JSON.stringify(testResult.suggested_mapping, null, 2));
  };

  const applyDetectedColumnsTemplate = () => {
    if (!testResult || testResult.detected_columns.length === 0) return;
    const template: Record<string, string> = {};
    for (const col of testResult.detected_columns) {
      template[col] = '';
    }
    setField('column_mapping', JSON.stringify(template, null, 2));
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await api.delete(id);
    await loadSources();
  };

  const handleRun = async (ds: DataSource) => {
    setRunningId(ds.id);
    try {
      await api.run(ds.id);
      await loadSources();
      if (selectedDs?.id === ds.id) {
        const { runs: r } = await api.runs(ds.id);
        setRuns(r);
      }
    } finally {
      setTimeout(() => setRunningId(null), 2000);
    }
  };

  const refreshRuns = async () => {
    if (!selectedDs) return;
    setRunsLoading(true);
    try {
      const [{ runs: r }, { data_sources }] = await Promise.all([
        api.runs(selectedDs.id),
        api.list(),
      ]);
      setRuns(r);
      setSources(data_sources);
      const updated = data_sources.find((d) => d.id === selectedDs.id);
      if (updated) setSelectedDs(updated);
    } finally {
      setRunsLoading(false);
    }
  };

  const setField = (key: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <Spinner />;

  if (view === 'detail' && selectedDs) {
    return (
      <DataSourceDetailView
        selectedDs={selectedDs}
        runs={runs}
        runsLoading={runsLoading}
        runningId={runningId}
        expandedRunId={expandedRunId}
        onBack={() => { setView('list'); setSelectedDs(null); }}
        onRun={handleRun}
        onEdit={openEdit}
        onRefresh={refreshRuns}
        onToggleExpand={setExpandedRunId}
      />
    );
  }

  if (view === 'form') {
    return (
      <DataSourceFormView
        form={form}
        setField={setField}
        entities={entities}
        vaultCreds={vaultCreds}
        editId={editId}
        saving={saving}
        testingSource={testingSource}
        testError={testError}
        testResult={testResult}
        onSave={handleSave}
        onTest={handleTestSource}
        onCancel={() => setView('list')}
        onApplySuggestedMapping={applySuggestedMapping}
        onApplyDetectedColumnsTemplate={applyDetectedColumnsTemplate}
      />
    );
  }

  return (
    <DataSourceListView
      sources={sources}
      runningId={runningId}
      onCreate={openCreate}
      onOpen={openDetail}
      onRun={handleRun}
      onEdit={openEdit}
      onDelete={handleDelete}
    />
  );
}
