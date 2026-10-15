/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import {
  INTUNE_MOCK_DEVICES,
  createIntuneConnector,
  fetchIntuneAccessToken,
  fetchIntuneManagedDevices,
  resolveIntuneCredentials,
} from './intune';

describe('resolveIntuneCredentials', () => {
  it('returns null when credentials are incomplete', () => {
    const prev = {
      tenant: process.env.INTUNE_TENANT_ID,
      client: process.env.INTUNE_CLIENT_ID,
      secret: process.env.INTUNE_CLIENT_SECRET,
    };
    delete process.env.INTUNE_TENANT_ID;
    delete process.env.INTUNE_CLIENT_ID;
    delete process.env.INTUNE_CLIENT_SECRET;
    expect(resolveIntuneCredentials({ tenantId: 't', clientId: 'c' })).toBeNull();
    process.env.INTUNE_TENANT_ID = prev.tenant;
    process.env.INTUNE_CLIENT_ID = prev.client;
    process.env.INTUNE_CLIENT_SECRET = prev.secret;
  });

  it('accepts explicit credentials', () => {
    expect(resolveIntuneCredentials({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
    })).toEqual({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
    });
  });
});

describe('createIntuneConnector', () => {
  it('returns mock devices when credentials are missing', async () => {
    const prev = {
      tenant: process.env.INTUNE_TENANT_ID,
      client: process.env.INTUNE_CLIENT_ID,
      secret: process.env.INTUNE_CLIENT_SECRET,
    };
    delete process.env.INTUNE_TENANT_ID;
    delete process.env.INTUNE_CLIENT_ID;
    delete process.env.INTUNE_CLIENT_SECRET;
    try {
      const connector = createIntuneConnector(null);
      const devices = await connector.fetchDevices();
      expect(devices).toHaveLength(INTUNE_MOCK_DEVICES.length);
      expect(devices[0].externalId).toBe('mock-intune-device-001');
    } finally {
      process.env.INTUNE_TENANT_ID = prev.tenant;
      process.env.INTUNE_CLIENT_ID = prev.client;
      process.env.INTUNE_CLIENT_SECRET = prev.secret;
    }
  });

  it('returns mock devices when dryRun is true even with credentials', async () => {
    const fetchImpl = vi.fn();
    const connector = createIntuneConnector({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
    }, fetchImpl as unknown as typeof fetch);
    const devices = await connector.fetchDevices({ dryRun: true });
    expect(devices).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls Graph token + devices endpoints with client credentials', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/v2.0/token')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('grant_type=client_credentials');
        return new Response(JSON.stringify({ access_token: 'tok-123' }), { status: 200 });
      }
      if (url.includes('deviceManagement/managedDevices')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
        return new Response(JSON.stringify({
          value: [{
            id: 'dev-1',
            deviceName: 'LAPTOP-1',
            serialNumber: 'SN1',
            manufacturer: 'Contoso',
            model: 'X1',
            operatingSystem: 'Windows',
            osVersion: '11',
            azureADDeviceId: 'aad-1',
            complianceState: 'compliant',
          }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const connector = createIntuneConnector({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
    }, fetchImpl as unknown as typeof fetch);

    const devices = await connector.fetchDevices({ dryRun: false });
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      externalId: 'dev-1',
      externalIdSecondary: 'aad-1',
      name: 'LAPTOP-1',
      statusHint: 'in_use',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('fetchIntuneAccessToken / fetchIntuneManagedDevices', () => {
  it('surfaces token errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(fetchIntuneAccessToken({
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
    }, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/token request failed/);
  });

  it('follows odata nextLink once', async () => {
    let page = 0;
    const fetchImpl = vi.fn(async () => {
      page += 1;
      if (page === 1) {
        return new Response(JSON.stringify({
          value: [{ id: 'a', deviceName: 'A' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=x',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        value: [{ id: 'b', deviceName: 'B' }],
      }), { status: 200 });
    });
    const devices = await fetchIntuneManagedDevices('tok', fetchImpl as unknown as typeof fetch);
    expect(devices.map((d) => d.externalId)).toEqual(['a', 'b']);
  });
});
