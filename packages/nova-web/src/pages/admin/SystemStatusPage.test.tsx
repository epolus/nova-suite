/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemStatusPage from './SystemStatusPage';

const mockCacheMetrics = vi.fn();
const mockResetCacheMetrics = vi.fn();
const mockAuditEvents = vi.fn();
const mockRuntimeHealth = vi.fn();

vi.mock('../../api/client', () => ({
  settings: {
    cacheMetrics: (...args: unknown[]) => mockCacheMetrics(...args),
    resetCacheMetrics: (...args: unknown[]) => mockResetCacheMetrics(...args),
  },
  admin: {
    auditEvents: (...args: unknown[]) => mockAuditEvents(...args),
    runtimeHealth: (...args: unknown[]) => mockRuntimeHealth(...args),
  },
}));

describe('SystemStatusPage', () => {
  beforeEach(() => {
    mockCacheMetrics.mockReset();
    mockResetCacheMetrics.mockReset();
    mockAuditEvents.mockReset();
    mockRuntimeHealth.mockReset();
    mockAuditEvents.mockResolvedValue({ events: [] });
    mockRuntimeHealth.mockResolvedValue({ status: 'healthy', checks: { database: 'connected' } });
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

    render(<SystemStatusPage />);

    expect(await screen.findByText('System Status')).toBeInTheDocument();
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(await screen.findByText('66.7%')).toBeInTheDocument();
    expect(await screen.findByText('10 / 5')).toBeInTheDocument();
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

    render(<SystemStatusPage />);
    const user = userEvent.setup();

    await screen.findByText('System Status');
    await user.click(await screen.findByRole('button', { name: 'Reset metrics' }));

    await waitFor(() => expect(mockResetCacheMetrics).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cache metrics reset.')).toBeInTheDocument();
    expect(await screen.findByText('0 / 0')).toBeInTheDocument();
  });

  it('renders runtime health payload even when /health returns 503', async () => {
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

    render(<SystemStatusPage />);

    expect(await screen.findByText('Runtime health')).toBeInTheDocument();
    expect(await screen.findByText('degraded')).toBeInTheDocument();
    expect(await screen.findByText(/disconnected/)).toBeInTheDocument();
  });
});
