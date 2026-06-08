/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'use-intl';
import enMessages from '../../i18n/messages/en.json';
import SystemStatusPage from './SystemStatusPage';

const mockCacheMetrics = vi.fn();
const mockResetCacheMetrics = vi.fn();
const mockAuditEvents = vi.fn();
const mockRuntimeHealth = vi.fn();
const mockSystemMetrics = vi.fn();

vi.mock('../../api/client', () => ({
  settings: {
    cacheMetrics: (...args: unknown[]) => mockCacheMetrics(...args),
    resetCacheMetrics: (...args: unknown[]) => mockResetCacheMetrics(...args),
  },
  admin: {
    auditEvents: (...args: unknown[]) => mockAuditEvents(...args),
    runtimeHealth: (...args: unknown[]) => mockRuntimeHealth(...args),
    systemMetrics: (...args: unknown[]) => mockSystemMetrics(...args),
  },
}));

function renderPage() {
  return render(
    <IntlProvider locale="en" messages={enMessages}>
      <SystemStatusPage />
    </IntlProvider>,
  );
}

describe('SystemStatusPage', () => {
  beforeEach(() => {
    mockCacheMetrics.mockReset();
    mockResetCacheMetrics.mockReset();
    mockAuditEvents.mockReset();
    mockRuntimeHealth.mockReset();
    mockSystemMetrics.mockReset();
    mockAuditEvents.mockResolvedValue({ events: [] });
    mockRuntimeHealth.mockResolvedValue({ status: 'healthy', checks: { database: 'connected' } });
    mockSystemMetrics.mockResolvedValue({
      timestamp: '2026-01-01T00:00:00.000Z',
      database: {
        totalBytes: 1024,
        growthBytes24h: null,
        growthBytes7d: null,
        topTables: [],
        p50QueryMs: 10,
        p95QueryMs: 40,
        slowQueriesPerMin: 1,
        activeConnections: 2,
        maxConnections: 20,
        connectionUsagePct: 10,
        status: 'healthy',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      api: {
        p50Ms: 15,
        p95Ms: 70,
        p99Ms: 120,
        rpm: 5.2,
        errorRate5xxPct: 0.2,
        errorRate4xxPct: 1.2,
        status: 'healthy',
        sourceWindowMinutes: 30,
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      queue: {
        backlog: 1,
        failed24h: 0,
        oldestQueuedAgeSec: 20,
        status: 'healthy',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      runtime: {
        uptimeSec: 3600,
        version: '1.0.0',
        appStatus: 'healthy',
        dbStatus: 'connected',
        redisStatus: 'connected',
        temporalStatus: 'connected',
        workerStatus: 'alive',
        schemaStatus: 'compatible',
        lastDeployAt: null,
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('renders cache metrics loaded from API', async () => {
    mockCacheMetrics.mockResolvedValue({
      cache: {
        enabled: true,
        connected: true,
        url: 'redis://redis:6379',
        defaultTtlSeconds: 300,
        getHits: 10,
        getMisses: 5,
        getErrors: 0,
        setOps: 3,
        setErrors: 0,
        delOps: 1,
        delErrors: 0,
        totalGets: 15,
        hitRatio: 10 / 15,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
    mockAuditEvents.mockResolvedValue({ events: [] });

    renderPage();

    expect(await screen.findByText('System Status')).toBeInTheDocument();
    expect(await screen.findByText('Redis Cache')).toBeInTheDocument();
    expect((await screen.findAllByText('Healthy')).length).toBeGreaterThan(0);
    expect(await screen.findByText('66.7%')).toBeInTheDocument();
    expect(await screen.findByText('10 / 5')).toBeInTheDocument();
    expect(await screen.findByText('System telemetry')).toBeInTheDocument();
    expect(await screen.findByText('Top database tables')).toBeInTheDocument();
  });

  it('resets cache metrics and shows success toast', async () => {
    mockCacheMetrics.mockResolvedValue({
      cache: {
        enabled: true,
        connected: true,
        url: 'redis://redis:6379',
        defaultTtlSeconds: 300,
        getHits: 10,
        getMisses: 5,
        getErrors: 0,
        setOps: 3,
        setErrors: 0,
        delOps: 1,
        delErrors: 0,
        totalGets: 15,
        hitRatio: 10 / 15,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
    mockResetCacheMetrics.mockResolvedValue({
      success: true,
      cache: {
        enabled: true,
        connected: true,
        url: 'redis://redis:6379',
        defaultTtlSeconds: 300,
        getHits: 0,
        getMisses: 0,
        getErrors: 0,
        setOps: 0,
        setErrors: 0,
        delOps: 0,
        delErrors: 0,
        totalGets: 0,
        hitRatio: null,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
    mockAuditEvents.mockResolvedValue({ events: [] });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('System Status');
    await user.click(await screen.findByRole('button', { name: 'Reset metrics' }));

    await waitFor(() => expect(mockResetCacheMetrics).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cache metrics reset.')).toBeInTheDocument();
    expect(await screen.findByText('0 / 0')).toBeInTheDocument();
  });

  it('renders raw diagnostics payload when expanded', async () => {
    mockCacheMetrics.mockResolvedValue({
      cache: {
        enabled: true,
        connected: true,
        url: 'redis://redis:6379',
        defaultTtlSeconds: 300,
        getHits: 1,
        getMisses: 0,
        getErrors: 0,
        setOps: 0,
        setErrors: 0,
        delOps: 0,
        delErrors: 0,
        totalGets: 1,
        hitRatio: 1,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
    mockAuditEvents.mockResolvedValue({ events: [] });
    mockRuntimeHealth.mockResolvedValue({
      status: 'degraded',
      checks: {
        temporal: 'disconnected',
        database: 'connected',
      },
    });

    renderPage();

    expect(await screen.findByText('Raw diagnostics')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show JSON' }));
    expect(await screen.findByText(/disconnected/)).toBeInTheDocument();
  });
});
