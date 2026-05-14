/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

describe('major incident workflow exports', () => {
  it('exports workflow and signal definitions', async () => {
    const m = await import('./major-incident');
    expect(typeof m.majorIncidentWorkflow).toBe('function');
    expect(m.declareResolvedSignal).toBeDefined();
    expect(m.stakeholderUpdateSignal).toBeDefined();
  });

  it('exports postmortem workflow', async () => {
    const m = await import('./postmortem');
    expect(typeof m.postmortemWorkflow).toBe('function');
    expect(m.postmortemPublishedSignal).toBeDefined();
  });
});
