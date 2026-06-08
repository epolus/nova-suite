/* SPDX-License-Identifier: AGPL-3.0-only */
export interface EntityFieldDef {
  key: string;
  label: string;
  fields: { key: string; label: string; required: boolean }[];
}

export interface ImportUploadResult {
  id: string;
  entity_type: string;
  file_name: string;
  total_rows: number;
  file_columns: string[];
  suggested_mapping: Record<string, string>;
  fields: {
    key: string;
    label: string;
    required: boolean;
    type?: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'enum';
    enum_values?: string[];
    resolve_table?: string | null;
    resolve_match?: string | null;
  }[];
}

export interface ImportJob {
  id: string;
  tenant_id: string;
  created_by: string;
  created_by_name?: string;
  entity_type: string;
  file_name: string;
  status: string;
  column_mapping: Record<string, string> | null;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  committed_rows: number;
  created_at: string;
  updated_at: string;
}

export interface ImportRow {
  id: string;
  job_id: string;
  row_number: number;
  raw_data: Record<string, string>;
  mapped_data: Record<string, unknown> | null;
  status: string;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  created_at: string;
}

export interface ImportValidationResult {
  total: number;
  valid: number;
  errors: number;
  warnings: number;
}
