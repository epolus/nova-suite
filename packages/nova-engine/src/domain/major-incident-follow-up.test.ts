/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { canStartInvestigation, existingFollowUpId } from './major-incident-follow-up';

describe('major incident investigation and follow-up', () => {
  it('starts investigation only from declared', () => {
    expect(canStartInvestigation('declared')).toBe(true);
    expect(canStartInvestigation('investigating')).toBe(false);
    expect(canStartInvestigation('pending_acceptance')).toBe(false);
    expect(canStartInvestigation('monitoring')).toBe(false);
  });

  it('reuses an action item that already has a problem or change', () => {
    expect(existingFollowUpId({ problem_id: 'p1' }, 'problem')).toBe('p1');
    expect(existingFollowUpId({ problem_id: 'p1' }, 'change')).toBeNull();
    expect(existingFollowUpId({ change_id: 'c1' }, 'change')).toBe('c1');
    expect(existingFollowUpId({}, 'problem')).toBeNull();
  });
});