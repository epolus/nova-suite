/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { changeImprovementAllowed, problemImprovementAllowed } from './improvements';

describe('continual improvement sources', () => {
  it('registers a change only after an unsuccessful review', () => {
    expect(changeImprovementAllowed(false)).toBe(true);
    expect(changeImprovementAllowed(true)).toBe(false);
    expect(changeImprovementAllowed(null)).toBe(false);
  });

  it('registers a problem only when a permanent fix is recorded', () => {
    expect(problemImprovementAllowed('Replace the failing disk')).toBe(true);
    expect(problemImprovementAllowed('  ')).toBe(false);
    expect(problemImprovementAllowed(null)).toBe(false);
  });
});
