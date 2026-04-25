/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getRequestApprovalTrigger, NOTIFICATION_TRIGGER_KEYS } from './triggers';

describe('notification trigger matrix', () => {
  it('contains the expected request triggers', () => {
    expect(NOTIFICATION_TRIGGER_KEYS.request).toEqual([
      'request.created',
      'request.approved',
      'request.rejected',
    ]);
  });

  it('has no duplicate trigger keys across entities', () => {
    const all = Object.values(NOTIFICATION_TRIGGER_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('request approval trigger mapping', () => {
  it('maps legacy approve/reject actions', () => {
    expect(getRequestApprovalTrigger('approve')).toBe('request.approved');
    expect(getRequestApprovalTrigger('reject')).toBe('request.rejected');
  });

  it('maps task approval outcomes', () => {
    expect(getRequestApprovalTrigger('approved')).toBe('request.approved');
    expect(getRequestApprovalTrigger('rejected')).toBe('request.rejected');
  });
});

