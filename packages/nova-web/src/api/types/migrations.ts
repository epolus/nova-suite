/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  MigrationConfigPackage,
  MigrationReport,
  ServiceNowExtractOptions,
  ServiceNowProbeResult,
} from '@nova-suite/shared/migrators/servicenow';
import type { ConfigPackageValidationReport } from './configPackages';

export type { MigrationConfigPackage, MigrationReport, ServiceNowExtractOptions, ServiceNowProbeResult };

export interface ServiceNowConnection {
  instance_url: string;
  credential_slug: string;
}

export interface ServiceNowCatalogBrowse {
  catalogs: Array<{ sys_id: string; title: string; description?: string }>;
  categories: Array<{ sys_id: string; title: string; parent: string; sc_catalog: string }>;
  items: Array<{
    sys_id: string;
    name: string;
    short_description: string;
    category: string;
    catalogs: string[];
    active: boolean;
    has_flow: boolean;
    has_legacy_workflow: boolean;
    record_producer: boolean;
  }>;
  truncated: boolean;
}

export type MigrationRunStatus = 'queued' | 'extracting' | 'transforming' | 'ready' | 'applying' | 'applied' | 'failed';

export interface MigrationRunSummary {
  id: string;
  source: 'servicenow';
  instance_url: string;
  credential_slug: string;
  options: ServiceNowExtractOptions;
  status: MigrationRunStatus;
  progress: Record<string, unknown> & { stage?: string };
  error: string | null;
  config_package_run_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  totals: MigrationReport['totals'] | null;
}

export interface MigrationRunDetail extends MigrationRunSummary {
  report: MigrationReport | null;
  has_package: boolean;
}

export interface MigrationApplyResponse {
  success: boolean;
  run_id: string;
  dry_run: ConfigPackageValidationReport;
  applied?: {
    categories: number;
    service_items: number;
    catalog_tasks: number;
    workflow_definitions?: number;
  };
  groups: { created: string[]; unassigned: string[] };
}
