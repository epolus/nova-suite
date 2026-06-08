/* SPDX-License-Identifier: AGPL-3.0-only */
export interface DataSource {
  id: string;
  name: string;
  description: string | null;
  entity_type: string;
  source_type: 'csv_url' | 'json_url' | 'rest_api' | 'sftp';
  source_config: {
    url?: string;
    headers?: Record<string, string>;
    json_path?: string;
    /** Resolved from tenant_credentials at import time (same slugs as catalog {{cred.slug}}). */
    credential_slug?: string;
    // OAuth2
    auth_type?: 'none' | 'bearer' | 'oauth2';
    bearer_token?: string;
    oauth2_token_url?: string;
    oauth2_client_id?: string;
    oauth2_client_secret?: string;
    oauth2_scope?: string;
    pagination?: {
      enabled?: boolean;
      mode?: 'page' | 'offset';
      page_param?: string;
      page_start?: number;
      page_size_param?: string;
      page_size?: number;
      offset_param?: string;
      offset_start?: number;
      limit_param?: string;
      limit?: number;
      max_pages?: number;
    };
    // SFTP
    sftp_host?: string;
    sftp_port?: number;
    sftp_username?: string;
    sftp_password?: string;
    sftp_private_key?: string;
    sftp_path?: string;
    sftp_file_type?: 'csv' | 'json';
    // CSV options
    csv_delimiter?: string;
    csv_has_headers?: boolean;
  };
  column_mapping: Record<string, string | string[]>;
  schedule_cron: string;
  schedule_enabled: boolean;
  import_mode: 'insert' | 'upsert' | 'full_sync';
  upsert_key: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DataSourceRunErrorSample {
  row_index: number;
  error: string;
  data: Record<string, string>;
  mapped_data?: Record<string, unknown>;
}

export interface DataSourceRunMeta {
  detected_columns?: string[];
  mapping_used?: Record<string, string | string[]>;
}

export interface DataSourceRun {
  id: string;
  data_source_id: string;
  status: 'running' | 'completed' | 'failed';
  trigger_type: 'manual' | 'scheduled';
  total_rows: number;
  committed_rows: number;
  error_rows: number;
  skipped_rows: number;
  error_message: string | null;
  error_samples: DataSourceRunErrorSample[];
  run_meta: DataSourceRunMeta;
  started_at: string;
  completed_at: string | null;
}

export interface DataSourceTestResult {
  detected_columns: string[];
  sample_rows: Record<string, string>[];
  suggested_mapping: Record<string, string>;
  content_type: string;
}
