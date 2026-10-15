/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  DiscoveryConnector,
  DiscoveryCredentials,
  DiscoveredDevice,
  FetchDevicesOptions,
} from './types';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH_DEVICES_URL =
  'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices'
  + '?$select=id,deviceName,serialNumber,manufacturer,model,operatingSystem,osVersion,'
  + 'azureADDeviceId,complianceState,managedDeviceOwnerType,userPrincipalName,lastSyncDateTime';

/** Mock devices used when credentials are absent or dryRun is requested. */
export const INTUNE_MOCK_DEVICES: DiscoveredDevice[] = [
  {
    externalId: 'mock-intune-device-001',
    externalIdSecondary: 'mock-aad-device-001',
    name: 'INTUNE-MOCK-LAPTOP-01',
    displayName: 'Mock Intune Laptop 01',
    serialNumber: 'SN-MOCK-001',
    manufacturer: 'Contoso',
    model: 'Surface Mock 5',
    operatingSystem: 'Windows',
    osVersion: '10.0.22631',
    assetTag: 'INTUNE-MOCK-001',
    statusHint: 'in_use',
  },
  {
    externalId: 'mock-intune-device-002',
    externalIdSecondary: 'mock-aad-device-002',
    name: 'INTUNE-MOCK-LAPTOP-02',
    displayName: 'Mock Intune Laptop 02',
    serialNumber: 'SN-MOCK-002',
    manufacturer: 'Contoso',
    model: 'Surface Mock 5',
    operatingSystem: 'Windows',
    osVersion: '10.0.22631',
    assetTag: 'INTUNE-MOCK-002',
    statusHint: 'in_stock',
  },
];

export function resolveIntuneCredentials(
  explicit?: Partial<DiscoveryCredentials> | null,
): DiscoveryCredentials | null {
  const tenantId = (explicit?.tenantId || process.env.INTUNE_TENANT_ID || '').trim();
  const clientId = (explicit?.clientId || process.env.INTUNE_CLIENT_ID || '').trim();
  const clientSecret = (explicit?.clientSecret || process.env.INTUNE_CLIENT_SECRET || '').trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

interface GraphManagedDevice {
  id?: string;
  deviceName?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  azureADDeviceId?: string | null;
  complianceState?: string | null;
  managedDeviceOwnerType?: string | null;
  userPrincipalName?: string | null;
  lastSyncDateTime?: string | null;
}

interface GraphCollection<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

function mapManagedDevice(d: GraphManagedDevice): DiscoveredDevice | null {
  if (!d.id) return null;
  const name = (d.deviceName || d.serialNumber || d.id).trim();
  const compliance = (d.complianceState || '').toLowerCase();
  let statusHint: DiscoveredDevice['statusHint'] = 'in_use';
  if (compliance === 'noncompliant') statusHint = 'maintenance';
  return {
    externalId: d.id,
    externalIdSecondary: d.azureADDeviceId || null,
    name,
    displayName: d.deviceName || name,
    serialNumber: d.serialNumber || null,
    manufacturer: d.manufacturer || null,
    model: d.model || null,
    operatingSystem: d.operatingSystem || null,
    osVersion: d.osVersion || null,
    assetTag: d.serialNumber ? `INTUNE-${d.serialNumber}` : `INTUNE-${d.id.slice(0, 8)}`,
    statusHint,
    raw: d as Record<string, unknown>,
  };
}

/**
 * Obtain an app-only access token via client credentials (Microsoft identity platform).
 * Real Graph call — used whenever credentials are present and dryRun is false.
 */
export async function fetchIntuneAccessToken(
  creds: DiscoveryCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const tokenUrl =
    `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: GRAPH_SCOPE,
  });
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const preview = (await response.text()).slice(0, 300);
    throw new Error(`Intune token request failed: ${response.status} – ${preview}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Intune token response missing access_token');
  return data.access_token;
}

/** Paginate Microsoft Graph managedDevices (follows @odata.nextLink). */
export async function fetchIntuneManagedDevices(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredDevice[]> {
  const devices: DiscoveredDevice[] = [];
  let url: string | null = GRAPH_DEVICES_URL;
  let pages = 0;
  const maxPages = 50;

  while (url && pages < maxPages) {
    pages += 1;
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const preview = (await response.text()).slice(0, 300);
      throw new Error(`Intune devices request failed: ${response.status} – ${preview}`);
    }
    const payload = (await response.json()) as GraphCollection<GraphManagedDevice>;
    for (const row of payload.value || []) {
      const mapped = mapManagedDevice(row);
      if (mapped) devices.push(mapped);
    }
    url = payload['@odata.nextLink'] || null;
  }

  return devices;
}

export function createIntuneConnector(
  explicit?: Partial<DiscoveryCredentials> | null,
  fetchImpl: typeof fetch = fetch,
): DiscoveryConnector {
  const creds = resolveIntuneCredentials(explicit);

  return {
    name: 'intune',
    async fetchDevices(options: FetchDevicesOptions = {}): Promise<DiscoveredDevice[]> {
      const dryRun = options.dryRun === true || !creds;
      if (dryRun) {
        return INTUNE_MOCK_DEVICES.map((d) => ({ ...d }));
      }
      const token = await fetchIntuneAccessToken(creds, fetchImpl);
      return fetchIntuneManagedDevices(token, fetchImpl);
    },
  };
}
