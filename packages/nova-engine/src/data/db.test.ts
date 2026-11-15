/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { CLEAR_TENANT_CONTEXT_SQL, releaseTenantClient } from './db';

function fakeClient(query: () => Promise<unknown>) {
  return { query: vi.fn(query), release: vi.fn() } as unknown as PoolClient & {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

describe('releaseTenantClient', () => {
  it('clears tenant context and returns the connection to the pool', async () => {
    const client = fakeClient(async () => ({ rows: [] }));
    await releaseTenantClient(client);
    expect(client.query).toHaveBeenCalledWith(CLEAR_TENANT_CONTEXT_SQL);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('destroys the connection when the context cannot be cleared', async () => {
    const client = fakeClient(async () => { throw new Error('connection terminated'); });
    await releaseTenantClient(client);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
