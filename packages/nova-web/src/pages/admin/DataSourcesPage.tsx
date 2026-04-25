/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import {
  dataSources as api,
  credentials as credentialsApi,
  type DataSource,
  type DataSourceRun,
  type DataSourceTestResult,
  type EntityFieldDef,
  type TenantCredentialListItem,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';

const SOURCE_TYPES = [
  { value: 'csv_url', label: 'CSV (URL)' },
  { value: 'json_url', label: 'JSON (URL)' },
  { value: 'rest_api', label: 'REST API' },
  { value: 'sftp', label: 'SFTP / SSH' },
];

const IMPORT_MODES = [
  { value: 'insert', label: 'Insert only (skip existing)' },
  { value: 'upsert', label: 'Upsert (insert or update)' },
];

const CRON_PRESETS = [
  { value: '0 2 * * *', label: 'Daily at 2:00 AM' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 */12 * * *', label: 'Every 12 hours' },
  { value: '0 0 * * 1', label: 'Weekly (Monday midnight)' },
  { value: '*/30 * * * *', label: 'Every 30 minutes' },
];

interface FormData {
  name: string;
  description: string;
  entity_type: string;
  source_type: string;
  url: string;
  headers: string;
  json_path: string;
  schedule_cron: string;
  schedule_enabled: boolean;
  import_mode: string;
  upsert_key: string;
  column_mapping: string;
  // OAuth2 (rest_api)
  auth_type: string;
  bearer_token: string;
  oauth2_token_url: string;
  oauth2_client_id: string;
  oauth2_client_secret: string;
  oauth2_scope: string;
  credential_slug: string;
  // REST pagination
  pagination_enabled: boolean;
  pagination_mode: 'page' | 'offset';
  pagination_page_param: string;
  pagination_page_start: string;
  pagination_page_size_param: string;
  pagination_page_size: string;
  pagination_offset_param: string;
  pagination_offset_start: string;
  pagination_limit_param: string;
  pagination_limit: string;
  pagination_max_pages: string;
  // SFTP
  sftp_host: string;
  sftp_port: string;
  sftp_username: string;
  sftp_password: string;
  sftp_private_key: string;
  sftp_path: string;
  sftp_file_type: string;
  // CSV options
  csv_delimiter: string;
  csv_has_headers: boolean;
}

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  entity_type: '',
  source_type: 'csv_url',
  url: '',
  headers: '',
  json_path: '',
  schedule_cron: '0 2 * * *',
  schedule_enabled: false,
  import_mode: 'insert',
  upsert_key: '',
  column_mapping: '{}',
  auth_type: 'none',
  bearer_token: '',
  oauth2_token_url: '',
  oauth2_client_id: '',
  oauth2_client_secret: '',
  oauth2_scope: '',
  credential_slug: '',
  pagination_enabled: false,
  pagination_mode: 'page',
  pagination_page_param: 'page',
  pagination_page_start: '1',
  pagination_page_size_param: 'limit',
  pagination_page_size: '100',
  pagination_offset_param: 'offset',
  pagination_offset_start: '0',
  pagination_limit_param: 'limit',
  pagination_limit: '100',
  pagination_max_pages: '20',
  sftp_host: '',
  sftp_port: '22',
  sftp_username: '',
  sftp_password: '',
  sftp_private_key: '',
  sftp_path: '',
  sftp_file_type: 'csv',
  csv_delimiter: 'auto',
  csv_has_headers: true,
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return formatDateTime(d);
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">Never run</span>;
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    running: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function DataSourcesPage() {
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

      const sourceConfig: Record<string, unknown> = {};

      // CSV options (for any CSV-based source)
      const isCsvSource = form.source_type === 'csv_url' || (form.source_type === 'sftp' && form.sftp_file_type === 'csv');
      if (isCsvSource) {
        if (form.csv_delimiter && form.csv_delimiter !== 'auto') sourceConfig.csv_delimiter = form.csv_delimiter;
        if (!form.csv_has_headers) sourceConfig.csv_has_headers = false;
      }

      if (form.source_type === 'sftp') {
        sourceConfig.sftp_host = form.sftp_host;
        if (form.sftp_port) sourceConfig.sftp_port = parseInt(form.sftp_port, 10);
        sourceConfig.sftp_username = form.sftp_username;
        if (form.sftp_password) sourceConfig.sftp_password = form.sftp_password;
        if (form.sftp_private_key) sourceConfig.sftp_private_key = form.sftp_private_key;
        sourceConfig.sftp_path = form.sftp_path;
        sourceConfig.sftp_file_type = form.sftp_file_type;
        if (form.json_path) sourceConfig.json_path = form.json_path;
      } else {
        sourceConfig.url = form.url;
        if (Object.keys(headers).length > 0) sourceConfig.headers = headers;
        if (form.json_path) sourceConfig.json_path = form.json_path;
        if (form.source_type === 'rest_api') {
          sourceConfig.auth_type = form.auth_type;
          if (form.auth_type === 'bearer') {
            sourceConfig.bearer_token = form.bearer_token;
          } else if (form.auth_type === 'oauth2') {
            sourceConfig.oauth2_token_url = form.oauth2_token_url;
            sourceConfig.oauth2_client_id = form.oauth2_client_id;
            sourceConfig.oauth2_client_secret = form.oauth2_client_secret;
            if (form.oauth2_scope) sourceConfig.oauth2_scope = form.oauth2_scope;
          }
          if (form.pagination_enabled) {
            sourceConfig.pagination = {
              enabled: true,
              mode: form.pagination_mode,
              page_param: form.pagination_page_param || 'page',
              page_start: parseInt(form.pagination_page_start || '1', 10) || 1,
              page_size_param: form.pagination_page_size_param || 'limit',
              page_size: parseInt(form.pagination_page_size || '100', 10) || 100,
              offset_param: form.pagination_offset_param || 'offset',
              offset_start: parseInt(form.pagination_offset_start || '0', 10) || 0,
              limit_param: form.pagination_limit_param || 'limit',
              limit: parseInt(form.pagination_limit || '100', 10) || 100,
              max_pages: parseInt(form.pagination_max_pages || '20', 10) || 20,
            };
          }
        }
      }

      const slugTrim = form.credential_slug?.trim();
      if (slugTrim) {
        sourceConfig.credential_slug = slugTrim;
        delete sourceConfig.bearer_token;
        delete sourceConfig.oauth2_client_secret;
        delete sourceConfig.sftp_password;
      }

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

      const sourceConfig: Record<string, unknown> = {};
      if (form.source_type === 'sftp') {
        sourceConfig.sftp_host = form.sftp_host;
        if (form.sftp_port) sourceConfig.sftp_port = parseInt(form.sftp_port, 10);
        sourceConfig.sftp_username = form.sftp_username;
        if (form.sftp_password) sourceConfig.sftp_password = form.sftp_password;
        if (form.sftp_private_key) sourceConfig.sftp_private_key = form.sftp_private_key;
        sourceConfig.sftp_path = form.sftp_path;
        sourceConfig.sftp_file_type = form.sftp_file_type;
        if (form.json_path) sourceConfig.json_path = form.json_path;
      } else {
        sourceConfig.url = form.url;
        if (Object.keys(headers).length > 0) sourceConfig.headers = headers;
        if (form.json_path) sourceConfig.json_path = form.json_path;
      }
      if (form.source_type === 'rest_api') {
        sourceConfig.auth_type = form.auth_type;
        if (form.auth_type === 'bearer') sourceConfig.bearer_token = form.bearer_token;
        if (form.auth_type === 'oauth2') {
          sourceConfig.oauth2_token_url = form.oauth2_token_url;
          sourceConfig.oauth2_client_id = form.oauth2_client_id;
          sourceConfig.oauth2_client_secret = form.oauth2_client_secret;
          if (form.oauth2_scope) sourceConfig.oauth2_scope = form.oauth2_scope;
        }
        if (form.pagination_enabled) {
          sourceConfig.pagination = {
            enabled: true,
            mode: form.pagination_mode,
            page_param: form.pagination_page_param || 'page',
            page_start: parseInt(form.pagination_page_start || '1', 10) || 1,
            page_size_param: form.pagination_page_size_param || 'limit',
            page_size: parseInt(form.pagination_page_size || '100', 10) || 100,
            offset_param: form.pagination_offset_param || 'offset',
            offset_start: parseInt(form.pagination_offset_start || '0', 10) || 0,
            limit_param: form.pagination_limit_param || 'limit',
            limit: parseInt(form.pagination_limit || '100', 10) || 100,
            max_pages: parseInt(form.pagination_max_pages || '20', 10) || 20,
          };
        }
      }

      const slugTrimTest = form.credential_slug?.trim();
      if (slugTrimTest) {
        sourceConfig.credential_slug = slugTrimTest;
        delete sourceConfig.bearer_token;
        delete sourceConfig.oauth2_client_secret;
        delete sourceConfig.sftp_password;
      }

      const { result } = await api.testSource({
        entity_type: form.entity_type,
        source_type: form.source_type as DataSource['source_type'],
        source_config: sourceConfig as DataSource['source_config'],
      });
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test source failed');
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
    if (!confirm('Delete this data source and all run history?')) return;
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

  const entityFields = entities.find((e) => e.key === form.entity_type)?.fields || [];

  if (loading) return <Spinner />;

  // ─── Detail view ───
  if (view === 'detail' && selectedDs) {
    return (
      <>
        <PageHeader
          title={selectedDs.name}
          description={`Data source details and run history`}
          action={
            <button
              onClick={() => { setView('list'); setSelectedDs(null); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Back to List
            </button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Entity Type</div>
            <div className="font-medium text-gray-900">{selectedDs.entity_type}</div>
          </Card>
          <Card>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Schedule</div>
            <div className="font-medium text-gray-900">
              {selectedDs.schedule_enabled ? (
                <span className="text-green-700">{selectedDs.schedule_cron}</span>
              ) : (
                <span className="text-gray-400">Disabled</span>
              )}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Last Run</div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedDs.last_run_status} />
              <span className="text-sm text-gray-500">{formatDate(selectedDs.last_run_at)}</span>
            </div>
          </Card>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => handleRun(selectedDs)}
            disabled={runningId === selectedDs.id}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {runningId === selectedDs.id ? 'Starting...' : 'Run Now'}
          </button>
          <button
            onClick={() => openEdit(selectedDs)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={refreshRuns}
            disabled={runsLoading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Run History</h3>
          {runsLoading ? (
            <Spinner />
          ) : runs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No runs yet. Click "Run Now" to trigger an import.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Started</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Trigger</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Committed</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Errors</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Skipped</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const duration = run.completed_at
                      ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                      : '—';
                    const hasErrors = run.error_rows > 0 || run.error_message || (run.error_samples && run.error_samples.length > 0);
                    const isExpanded = expandedRunId === run.id;
                    return (
                      <>
                        <tr
                          key={run.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${hasErrors ? 'cursor-pointer' : ''}`}
                          onClick={() => hasErrors && setExpandedRunId(isExpanded ? null : run.id)}
                        >
                          <td className="py-2 px-3 text-gray-600">{formatDate(run.started_at)}</td>
                          <td className="py-2 px-3"><StatusBadge status={run.status} /></td>
                          <td className="py-2 px-3 text-gray-500">{run.trigger_type}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-700">{run.total_rows}</td>
                          <td className="py-2 px-3 text-right font-mono text-green-600">{run.committed_rows}</td>
                          <td className="py-2 px-3 text-right font-mono text-red-600">{run.error_rows}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-500">{run.skipped_rows}</td>
                          <td className="py-2 px-3 text-gray-500">{duration}</td>
                          <td className="py-2 px-3 text-gray-400 text-xs">
                            {hasErrors && (isExpanded ? '▲' : '▼')}
                          </td>
                        </tr>
                        {isExpanded && hasErrors && (
                          <tr key={`${run.id}-detail`}>
                            <td colSpan={9} className="bg-red-50/50 px-4 py-3">
                              {run.error_message && (
                                <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg text-xs text-red-800">
                                  <span className="font-semibold">Run Error:</span> {run.error_message}
                                </div>
                              )}
                              {run.run_meta?.detected_columns && (
                                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                  <span className="font-semibold text-blue-800">Detected columns in source:</span>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {run.run_meta.detected_columns.map((col) => (
                                      <span key={col} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">{col}</span>
                                    ))}
                                  </div>
                                  {run.run_meta.mapping_used && Object.keys(run.run_meta.mapping_used).length > 0 && (
                                    <div className="mt-2">
                                      <span className="font-semibold text-blue-800">Mapping applied:</span>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {Object.entries(run.run_meta.mapping_used).map(([src, tgt]) => {
                                          const found = run.run_meta?.detected_columns?.includes(src);
                                          return (
                                            <span key={src} className={`px-1.5 py-0.5 rounded font-mono ${found ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                              {src} → {tgt} {!found && '(not found!)'}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {run.error_samples && run.error_samples.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-red-800 mb-2">
                                    Error samples (first {run.error_samples.length} of {run.error_rows}):
                                  </p>
                                  <div className="space-y-2">
                                    {run.error_samples.map((sample, i) => (
                                      <div key={i} className="p-2 bg-white border border-red-200 rounded-lg text-xs">
                                        <div className="flex items-start gap-2">
                                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-mono flex-shrink-0">
                                            Row {sample.row_index}
                                          </span>
                                          <span className="text-red-700 font-medium">{sample.error}</span>
                                        </div>
                                        {sample.mapped_data && (
                                          <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded font-mono text-amber-800 overflow-x-auto">
                                            <span className="text-amber-500 text-[10px] uppercase font-semibold">Mapped →</span>{' '}
                                            {Object.entries(sample.mapped_data).slice(0, 8).map(([k, v]) => (
                                              <span key={k} className="inline-block mr-3">
                                                <span className="text-amber-500">{k}:</span> {v != null && String(v).length > 0 ? String(v).slice(0, 50) : <span className="text-red-400 font-semibold">NULL</span>}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        <div className="mt-1.5 p-1.5 bg-gray-50 rounded font-mono text-gray-600 overflow-x-auto">
                                          <span className="text-gray-400 text-[10px] uppercase font-semibold">Raw →</span>{' '}
                                          {Object.entries(sample.data).slice(0, 8).map(([k, v]) => (
                                            <span key={k} className="inline-block mr-3">
                                              <span className="text-gray-400">{k}:</span> {String(v).slice(0, 50) || <span className="text-gray-300 italic">empty</span>}
                                            </span>
                                          ))}
                                          {Object.keys(sample.data).length > 8 && (
                                            <span className="text-gray-400">... +{Object.keys(sample.data).length - 8} more</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {run.error_rows > 0 && (!run.error_samples || run.error_samples.length === 0) && !run.error_message && (
                                <p className="text-xs text-red-600">
                                  {run.error_rows} rows failed. Re-run the import to capture detailed error samples.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  // ─── Form view ───
  if (view === 'form') {
    return (
      <>
        <PageHeader
          title={editId ? 'Edit Data Source' : 'New Data Source'}
          description={editId ? 'Update data source configuration' : 'Configure a new scheduled data import'}
          action={
            <button
              onClick={() => setView('list')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          }
        />

        <div className="max-w-3xl space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. HR User Sync"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
                  <select
                    value={form.entity_type}
                    onChange={(e) => setField('entity_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">Select...</option>
                    {entities.map((e) => (
                      <option key={e.key} value={e.key}>{e.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Import Mode</label>
                  <select
                    value={form.import_mode}
                    onChange={(e) => setField('import_mode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    {IMPORT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.import_mode === 'upsert' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upsert Key
                    <span className="text-gray-400 font-normal ml-1">(match existing records by this field)</span>
                  </label>
                  <select
                    value={form.upsert_key}
                    onChange={(e) => setField('upsert_key', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">Default (auto)</option>
                    {entityFields.map((f) => (
                      <option key={f.key} value={f.key}>{f.key}{f.required ? ' *' : ''}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">
                    Rows where this field matches an existing record will be updated. Non-matching rows will be inserted.
                    {!form.upsert_key && form.entity_type && (
                      <span className="text-indigo-500">
                        {' '}Default key: {
                          { departments: 'name', cost_centers: 'code', users: 'email', assignment_groups: 'name', cmdb: 'name' }[form.entity_type] || 'none'
                        }
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Data Source</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
                <select
                  value={form.source_type}
                  onChange={(e) => setField('source_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  {SOURCE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* ── HTTP-based sources (csv_url, json_url, rest_api) ── */}
              {form.source_type !== 'sftp' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="url"
                      value={form.url}
                      onChange={(e) => setField('url', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="https://api.example.com/users.csv"
                    />
                  </div>
                  {(form.source_type === 'json_url' || form.source_type === 'rest_api') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        JSON Path
                        <span className="text-gray-400 font-normal ml-1">(optional, e.g. "data.results")</span>
                      </label>
                      <input
                        type="text"
                        value={form.json_path}
                        onChange={(e) => setField('json_path', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="data.results"
                      />
                    </div>
                  )}
                  {form.source_type === 'rest_api' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        HTTP Headers
                        <span className="text-gray-400 font-normal ml-1">(JSON, additional headers)</span>
                      </label>
                      <textarea
                        value={form.headers}
                        onChange={(e) => setField('headers', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder='{"X-Custom-Header": "value"}'
                      />
                    </div>
                  )}
                </>
              )}

              {/* ── SFTP source ── */}
              {form.source_type === 'sftp' && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">SFTP Host</label>
                      <input
                        type="text"
                        value={form.sftp_host}
                        onChange={(e) => setField('sftp_host', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="sftp.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input
                        type="number"
                        value={form.sftp_port}
                        onChange={(e) => setField('sftp_port', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="22"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      type="text"
                      value={form.sftp_username}
                      onChange={(e) => setField('sftp_username', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="sftp_user"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                      <span className="text-gray-400 font-normal ml-1">(or use private key below)</span>
                    </label>
                    <input
                      type="password"
                      value={form.sftp_password}
                      onChange={(e) => setField('sftp_password', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SSH Private Key
                      <span className="text-gray-400 font-normal ml-1">(PEM format, optional)</span>
                    </label>
                    <textarea
                      value={form.sftp_private_key}
                      onChange={(e) => setField('sftp_private_key', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remote File Path</label>
                      <input
                        type="text"
                        value={form.sftp_path}
                        onChange={(e) => setField('sftp_path', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="/exports/users.csv"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
                      <select
                        value={form.sftp_file_type}
                        onChange={(e) => setField('sftp_file_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                  </div>
                  {form.sftp_file_type === 'json' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        JSON Path
                        <span className="text-gray-400 font-normal ml-1">(optional, e.g. "data.results")</span>
                      </label>
                      <input
                        type="text"
                        value={form.json_path}
                        onChange={(e) => setField('json_path', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="data.results"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* ── CSV Options (csv_url, or sftp with csv file type) ── */}
          {(form.source_type === 'csv_url' || (form.source_type === 'sftp' && form.sftp_file_type === 'csv')) && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">CSV Options</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delimiter</label>
                  <select
                    value={form.csv_delimiter}
                    onChange={(e) => setField('csv_delimiter', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value={'\t'}>Tab</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={form.csv_has_headers}
                      onChange={(e) => setField('csv_has_headers', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">First row contains headers</span>
                  </label>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                When headers are disabled, columns are named col_1, col_2, etc. Use these names in your column mapping.
              </p>
            </Card>
          )}

          {(form.source_type === 'rest_api' || form.source_type === 'sftp') && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Encrypted vault (optional)</h3>
              <p className="text-xs text-gray-500 mb-3">
                Reference a slug from <strong>Admin → Credentials</strong>. At import time the worker decrypts it (same slugs as catalog{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{cred.slug}}'}</code>). When set, bearer / OAuth client secret / SFTP password fields are not stored on save.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">credential_slug</label>
                <input
                  list="nova-vault-slugs-ds"
                  value={form.credential_slug}
                  onChange={(e) => setField('credential_slug', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="my_integration_secret"
                />
                <datalist id="nova-vault-slugs-ds">
                  {vaultCreds.map((c) => (
                    <option key={c.id} value={c.slug}>{c.label}</option>
                  ))}
                </datalist>
              </div>
            </Card>
          )}

          {/* ── Authentication (REST API only) ── */}
          {form.source_type === 'rest_api' && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Authentication</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auth Type</label>
                  <select
                    value={form.auth_type}
                    onChange={(e) => setField('auth_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="none">None</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="oauth2">OAuth 2.0 (Client Credentials)</option>
                  </select>
                </div>

                {form.auth_type === 'bearer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bearer Token</label>
                    <input
                      type="password"
                      value={form.bearer_token}
                      onChange={(e) => setField('bearer_token', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="your-api-token"
                    />
                  </div>
                )}

                {form.auth_type === 'oauth2' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Token URL</label>
                      <input
                        type="url"
                        value={form.oauth2_token_url}
                        onChange={(e) => setField('oauth2_token_url', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="https://auth.example.com/oauth/token"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                        <input
                          type="text"
                          value={form.oauth2_client_id}
                          onChange={(e) => setField('oauth2_client_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          placeholder="client-id"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                        <input
                          type="password"
                          value={form.oauth2_client_secret}
                          onChange={(e) => setField('oauth2_client_secret', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          placeholder="client-secret"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scope
                        <span className="text-gray-400 font-normal ml-1">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.oauth2_scope}
                        onChange={(e) => setField('oauth2_scope', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="read:users read:data"
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      Uses the OAuth 2.0 Client Credentials grant. A fresh access token is obtained before each import run.
                    </p>
                  </>
                )}
              </div>
            </Card>
          )}

          {form.source_type === 'rest_api' && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Pagination (REST)</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pagination_enabled}
                    onChange={(e) => setField('pagination_enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable pagination</span>
                </label>

                {form.pagination_enabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                      <select
                        value={form.pagination_mode}
                        onChange={(e) => setField('pagination_mode', e.target.value as 'page' | 'offset')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="page">Page + size params</option>
                        <option value="offset">Offset + limit params</option>
                      </select>
                    </div>

                    {form.pagination_mode === 'page' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Page Param</label>
                          <input
                            type="text"
                            value={form.pagination_page_param}
                            onChange={(e) => setField('pagination_page_param', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="page"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Page</label>
                          <input
                            type="number"
                            value={form.pagination_page_start}
                            onChange={(e) => setField('pagination_page_start', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Size Param</label>
                          <input
                            type="text"
                            value={form.pagination_page_size_param}
                            onChange={(e) => setField('pagination_page_size_param', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="limit"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Page Size</label>
                          <input
                            type="number"
                            value={form.pagination_page_size}
                            onChange={(e) => setField('pagination_page_size', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="100"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Offset Param</label>
                          <input
                            type="text"
                            value={form.pagination_offset_param}
                            onChange={(e) => setField('pagination_offset_param', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="offset"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Offset</label>
                          <input
                            type="number"
                            value={form.pagination_offset_start}
                            onChange={(e) => setField('pagination_offset_start', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Limit Param</label>
                          <input
                            type="text"
                            value={form.pagination_limit_param}
                            onChange={(e) => setField('pagination_limit_param', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="limit"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Limit</label>
                          <input
                            type="number"
                            value={form.pagination_limit}
                            onChange={(e) => setField('pagination_limit', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="100"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Pages per Run</label>
                      <input
                        type="number"
                        value={form.pagination_max_pages}
                        onChange={(e) => setField('pagination_max_pages', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="20"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Safety limit to avoid endless loops. Import stops earlier when a page returns fewer rows.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Column Mapping</h3>
            <p className="text-xs text-gray-500 mb-3">
              Map source columns to target fields. Format: {`{"source_column": "target_field"}`}.
              <span className="block mt-1">
                One-to-many is supported: {`{"name": ["code", "name"]}`}
              </span>
              {entityFields.length > 0 && (
                <span className="block mt-1">
                  Available fields: {entityFields.map((f) => (
                    <span key={f.key} className={`inline-block mr-1 ${f.required ? 'font-semibold' : ''}`}>
                      {f.key}{f.required ? '*' : ''}
                    </span>
                  ))}
                </span>
              )}
            </p>
            <textarea
              value={form.column_mapping}
              onChange={(e) => setField('column_mapping', e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder='{"email": "email", "full_name": "display_name"}'
            />
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Schedule</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.schedule_enabled}
                  onChange={(e) => setField('schedule_enabled', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Enable scheduled imports</span>
              </label>
              {form.schedule_enabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cron Schedule</label>
                    <div className="flex gap-2">
                      <select
                        value={CRON_PRESETS.find((p) => p.value === form.schedule_cron) ? form.schedule_cron : '__custom'}
                        onChange={(e) => {
                          if (e.target.value !== '__custom') setField('schedule_cron', e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        {CRON_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                        <option value="__custom">Custom</option>
                      </select>
                      <input
                        type="text"
                        value={form.schedule_cron}
                        onChange={(e) => setField('schedule_cron', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="0 2 * * *"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Schedule uses cron syntax (min hour day month weekday). The workflow runs in Temporal.
                  </p>
                </>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <button
              onClick={handleTestSource}
              disabled={
                testingSource
                || !form.entity_type
                || (form.source_type === 'sftp'
                  ? (!form.sftp_host || !form.sftp_path)
                  : !form.url)
              }
              className="px-6 py-2.5 border border-indigo-300 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors"
            >
              {testingSource ? 'Testing...' : 'Test Source'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.entity_type || (form.source_type === 'sftp' ? (!form.sftp_host || !form.sftp_path) : !form.url)}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : (editId ? 'Update Data Source' : 'Create Data Source')}
            </button>
            <button
              onClick={() => setView('list')}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {(testError || testResult) && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">Test Result</h3>
              {testError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{testError}</p>
              )}
              {testResult && (
                <div className="space-y-3 text-sm">
                  <p className="text-gray-600">Detected columns from source ({testResult.content_type || 'unknown'}):</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Copy these as mapping template</span>
                    <button
                      onClick={applyDetectedColumnsTemplate}
                      disabled={testResult.detected_columns.length === 0}
                      className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Use detected columns template
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {testResult.detected_columns.length > 0 ? testResult.detected_columns.map((col) => (
                      <span key={col} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-mono text-xs">
                        {col}
                      </span>
                    )) : <span className="text-gray-400">No columns detected</span>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-gray-600">Suggested mapping</p>
                      <button
                        onClick={applySuggestedMapping}
                        disabled={Object.keys(testResult.suggested_mapping).length === 0}
                        className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                      >
                        Apply suggestion
                      </button>
                    </div>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-44">
                      {JSON.stringify(testResult.suggested_mapping, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <p className="text-gray-600 mb-1">Sample rows</p>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-56">
                      {JSON.stringify(testResult.sample_rows, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </>
    );
  }

  // ─── List view ───
  return (
    <>
      <PageHeader
        title="Data Sources"
        description="Configure scheduled data imports from external systems via Temporal workflows."
        action={
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + New Data Source
          </button>
        }
      />

      {sources.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="text-4xl mb-3 block">🔗</span>
            <h3 className="font-medium text-gray-900 mb-1">No data sources configured</h3>
            <p className="text-sm text-gray-500 mb-4">Create a data source to schedule automatic imports from external URLs or APIs.</p>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Create Data Source
            </button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((ds) => (
            <Card key={ds.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(ds)}>
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                      {ds.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{ds.entity_type}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{ds.source_type}</span>
                    {ds.schedule_enabled ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        {ds.schedule_cron}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">Manual only</span>
                    )}
                  </div>
                  {ds.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{ds.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <StatusBadge status={ds.last_run_status} />
                    {ds.last_run_at && (
                      <span className="text-xs text-gray-400">Last run: {formatDate(ds.last_run_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => handleRun(ds)}
                    disabled={runningId === ds.id}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    title="Run now"
                  >
                    {runningId === ds.id ? 'Starting...' : 'Run'}
                  </button>
                  <button
                    onClick={() => openEdit(ds)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(ds.id)}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
