/* SPDX-License-Identifier: AGPL-3.0-only */
import { formatDateTime } from '@/utils/dateTime';

export interface FormData {
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

export const EMPTY_FORM: FormData = {
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

export function formatDate(d: string | null, emDash: string) {
  if (!d) return emDash;
  return formatDateTime(d);
}

function buildPagination(form: FormData) {
  return {
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

export function buildSaveSourceConfig(
  form: FormData,
  headers: Record<string, string>,
): Record<string, unknown> {
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
        sourceConfig.pagination = buildPagination(form);
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

  return sourceConfig;
}

export function buildTestSourceConfig(
  form: FormData,
  headers: Record<string, string>,
): Record<string, unknown> {
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
      sourceConfig.pagination = buildPagination(form);
    }
  }

  const slugTrimTest = form.credential_slug?.trim();
  if (slugTrimTest) {
    sourceConfig.credential_slug = slugTrimTest;
    delete sourceConfig.bearer_token;
    delete sourceConfig.oauth2_client_secret;
    delete sourceConfig.sftp_password;
  }

  return sourceConfig;
}
