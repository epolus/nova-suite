/* SPDX-License-Identifier: AGPL-3.0-only */
export interface ConfigPackageBundle {
  format: 'nova.config-package';
  version: 1;
  name: string;
  schema_version: string;
  exported_at: string;
  source: Record<string, unknown>;
  contents: {
    catalog: {
      categories: Array<Record<string, unknown>>;
      service_items: Array<Record<string, unknown>>;
    };
    notifications: {
      rules: Array<Record<string, unknown>>;
    };
  };
}

export interface ConfigPackageValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ConfigPackageChange {
  type: 'category' | 'service_item' | 'catalog_task' | 'notification_rule';
  external_key: string;
  name: string;
  action: 'create' | 'update' | 'skip';
}

export interface ConfigPackageValidationReport {
  valid: boolean;
  issues: ConfigPackageValidationIssue[];
  changes: ConfigPackageChange[];
  summary: {
    create: number;
    update: number;
    skip: number;
    errors: number;
    warnings: number;
  };
}

export interface ConfigPackageExportResponse {
  package: ConfigPackageBundle;
  checksum: string;
}

export interface ConfigPackageValidateResponse {
  validation: ConfigPackageValidationReport;
  run_id: string;
  checksum: string;
}

export interface ConfigPackageApplyResponse {
  success: boolean;
  run_id: string;
  dry_run: ConfigPackageValidationReport;
  applied: {
    categories: number;
    service_items: number;
    catalog_tasks: number;
    notification_rules: number;
  };
}

export interface ConfigDeploymentRun {
  id: string;
  package_name: string;
  package_checksum: string;
  dry_run: boolean;
  status: 'validated' | 'applied' | 'failed';
  summary: Record<string, unknown>;
  result: Record<string, unknown>;
  actor_name?: string | null;
  created_at: string;
  applied_at: string | null;
}
