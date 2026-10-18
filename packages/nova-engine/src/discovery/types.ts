/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Discovery connectors pull devices from MDM / inventory APIs into CMDB + ITAM.
 * Generic CSV/JSON/REST data-source import remains the fallback for systems
 * without a first-party connector (Jamf, custom CMDB exports, etc.).
 */

export type AssetLifecycleStatus =
  | 'ordered'
  | 'in_stock'
  | 'in_use'
  | 'maintenance'
  | 'retired'
  | 'disposed';

export interface DiscoveredDevice {
  /** Primary external system id (stored on CI/asset external_id_1). */
  externalId: string;
  /** Secondary id e.g. Azure AD device id (external_id_2). */
  externalIdSecondary?: string | null;
  name: string;
  displayName?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  /** Preferred asset_tag; falls back to INTUNE-{externalId} when absent. */
  assetTag?: string | null;
  statusHint?: AssetLifecycleStatus;
  raw?: Record<string, unknown>;
}

export interface DiscoveryCredentials {
  /** Microsoft Entra (Azure AD) tenant id. */
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface FetchDevicesOptions {
  /** When true (or credentials missing), return mock devices without calling Graph. */
  dryRun?: boolean;
}

export interface DiscoveryConnector {
  readonly name: string;
  fetchDevices(options?: FetchDevicesOptions): Promise<DiscoveredDevice[]>;
}

export interface DiscoverySyncOptions {
  /** CI class name to attach (default: laptop). */
  className?: string;
  /** Also upsert ITAM assets linked to the CI (default: true). */
  createAssets?: boolean;
  dryRun?: boolean;
  /**
   * After upsert, retire connector-owned CIs and assets whose external id
   * is absent from this feed. An empty feed never retires.
   */
  fullSync?: boolean;
}

export interface DiscoverySyncResult {
  connector: string;
  dryRun: boolean;
  fetched: number;
  cisUpserted: number;
  assetsUpserted: number;
  cisRetired: number;
  assetsRetired: number;
  errors: string[];
  sample?: DiscoveredDevice[];
}
