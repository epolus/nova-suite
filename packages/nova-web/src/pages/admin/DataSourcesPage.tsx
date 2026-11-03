/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
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

const LIST_PATH = '/admin/data-sources';

function DataSourceEditor({
  initialForm,
  editId,
  entities,
  vaultCreds,
  loadSources,
}: {
  initialForm: FormData;
  editId: string | null;
  entities: EntityFieldDef[];
  vaultCreds: TenantCredentialListItem[];
  loadSources: () => Promise<void>;
}) {
  const t = useTranslations('pages.admin.dataSources');
  const navigate = useNavigate();
  const location = useLocation();
  const savedOnArrival = (location.state as { saved?: boolean } | null)?.saved === true;
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [testingSource, setTestingSource] = useState(false);
  const [testError, setTestError] = useState('');
  const [testResult, setTestResult] = useState<DataSourceTestResult | null>(null);
  const [saveMessage, setSaveMessage] = useState(savedOnArrival ? t('savedStay') : '');
  const [saveOk, setSaveOk] = useState(savedOnArrival);

  const setField = (key: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (closeAfter: boolean) => {
    setSaving(true);
    setSaveMessage('');
    setSaveOk(false);
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

      let savedId = editId;
      if (editId) {
        await api.update(editId, payload as Partial<DataSource>);
      } else {
        const created = await api.create(payload as Partial<DataSource>);
        savedId = created.id;
      }

      await loadSources();
      if (closeAfter) {
        navigate(LIST_PATH);
      } else if (!editId && savedId) {
        navigate(`${LIST_PATH}/${savedId}/edit`, { replace: true, state: { saved: true } });
        setSaveOk(true);
        setSaveMessage(t('savedStay'));
      } else {
        setSaveOk(true);
        setSaveMessage(t('savedStay'));
      }
    } catch (err) {
      setSaveOk(false);
      setSaveMessage(err instanceof Error ? err.message : t('saveFailed'));
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
      const response = await api.testSource({
        entity_type: form.entity_type,
        source_type: form.source_type as DataSource['source_type'],
        source_config: sourceConfig as DataSource['source_config'],
      });
      if (response.error || !response.result) {
        setTestError(response.error || t('testFailed'));
        return;
      }
      setTestResult(response.result);
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
    for (const col of testResult.detected_columns) template[col] = '';
    setField('column_mapping', JSON.stringify(template, null, 2));
  };

  return (
    <DataSourceFormView
      form={form}
      setField={setField}
      entities={entities}
      vaultCreds={vaultCreds}
      editId={editId}
      saving={saving}
      saveMessage={saveMessage}
      saveOk={saveOk}
      testingSource={testingSource}
      testError={testError}
      testResult={testResult}
      onSave={() => { void handleSave(false); }}
      onSaveAndClose={() => { void handleSave(true); }}
      onTest={handleTestSource}
      onCancel={() => navigate(LIST_PATH)}
      onApplySuggestedMapping={applySuggestedMapping}
      onApplyDetectedColumnsTemplate={applyDetectedColumnsTemplate}
    />
  );
}

function formFromSource(ds: DataSource): FormData {
  const cfg = ds.source_config;
  return {
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
    basic_username: cfg.basic_username || '',
    basic_password: cfg.basic_password || '',
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
    azure_tenant_id: cfg.azure_tenant_id || cfg.tenant_id || '',
    intune_client_id: cfg.client_id || '',
    intune_client_secret: cfg.client_secret || '',
    intune_class_name: cfg.class_name || 'laptop',
  };
}

export default function DataSourcesPage() {
  const t = useTranslations('pages.admin.dataSources');
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams<{ id?: string }>();
  const isNew = location.pathname === `${LIST_PATH}/new`;
  const isEdit = !!routeId && location.pathname === `${LIST_PATH}/${routeId}/edit`;
  const view = isNew || isEdit ? 'form' : routeId ? 'detail' : 'list';
  const editId = isEdit ? routeId : null;

  const [sources, setSources] = useState<DataSource[]>([]);
  const [entities, setEntities] = useState<EntityFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsState, setRunsState] = useState<{ id: string | null; runs: DataSourceRun[] }>({
    id: null,
    runs: [],
  });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
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

  const selectedDs = routeId && !isNew ? sources.find((ds) => ds.id === routeId) ?? null : null;
  const showList = useCallback(() => {
    navigate(LIST_PATH);
  }, [navigate]);

  const formKey = isNew ? 'new' : isEdit ? routeId : null;
  const runs = runsState.id === routeId ? runsState.runs : [];
  const runsLoading = view === 'detail' && !!routeId && runsState.id !== routeId;

  useEffect(() => {
    if (view !== 'detail' || !routeId) return undefined;
    let cancelled = false;
    const requestedId = routeId;
    api.runs(requestedId)
      .then(({ runs: nextRuns }) => {
        if (!cancelled) setRunsState({ id: requestedId, runs: nextRuns });
      })
      .catch(() => {
        if (!cancelled) setRunsState({ id: requestedId, runs: [] });
      });
    return () => { cancelled = true; };
  }, [view, routeId]);

  useEffect(() => {
    if (loading || !routeId || isNew) return;
    if (sources.some((ds) => ds.id === routeId)) return;
    navigate(LIST_PATH, { replace: true });
  }, [loading, routeId, isNew, sources, navigate]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await api.delete(id);
    if (routeId === id) navigate(LIST_PATH);
    await loadSources();
  };

  const handleRun = async (ds: DataSource) => {
    setRunningId(ds.id);
    try {
      await api.run(ds.id);
      await loadSources();
      if (routeId === ds.id) {
        const { runs: nextRuns } = await api.runs(ds.id);
        setRunsState({ id: ds.id, runs: nextRuns });
      }
    } finally {
      setTimeout(() => setRunningId(null), 2000);
    }
  };

  const refreshRuns = async () => {
    if (!routeId) return;
    setRunsState({ id: null, runs: [] });
    try {
      const [{ runs: nextRuns }, { data_sources }] = await Promise.all([
        api.runs(routeId),
        api.list(),
      ]);
      setRunsState({ id: routeId, runs: nextRuns });
      setSources(data_sources);
    } catch {
      setRunsState({ id: routeId, runs: [] });
    }
  };

  if (loading) return <Spinner />;

  if (view === 'detail') {
    if (!selectedDs) return <Spinner />;
    return (
      <DataSourceDetailView
        selectedDs={selectedDs}
        runs={runs}
        runsLoading={runsLoading}
        runningId={runningId}
        expandedRunId={expandedRunId}
        onBack={showList}
        onRun={handleRun}
        onEdit={(ds) => navigate(`${LIST_PATH}/${ds.id}/edit`)}
        onDelete={handleDelete}
        onRefresh={refreshRuns}
        onToggleExpand={setExpandedRunId}
      />
    );
  }

  if (view === 'form' && formKey) {
    const initialForm = formKey === 'new' ? EMPTY_FORM : selectedDs ? formFromSource(selectedDs) : null;
    if (!initialForm) return <Spinner />;
    return (
      <DataSourceEditor
        key={formKey}
        initialForm={initialForm}
        editId={editId}
        entities={entities}
        vaultCreds={vaultCreds}
        loadSources={loadSources}
      />
    );
  }

  return (
    <DataSourceListView
      sources={sources}
      onCreate={() => navigate(`${LIST_PATH}/new`)}
      onOpen={(ds) => navigate(`${LIST_PATH}/${ds.id}`)}
    />
  );
}
