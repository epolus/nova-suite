/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  canAccessImprovements,
  canViewAlerts,
  canViewOnCallRota,
  hasReportingCreateRole,
  hasReportingViewRole,
  isAgentRole,
  isFulfillerRole,
} from './roles';

describe('role helpers used by route gates', () => {
  it('treats fulfillers and specialized IT roles as agents', () => {
    expect(isAgentRole(['fulfiller'])).toBe(true);
    expect(isAgentRole(['change_manager'])).toBe(true);
    expect(isAgentRole(['user'])).toBe(false);
    expect(isAgentRole([])).toBe(false);
  });

  it('mirrors alert and on-call visibility', () => {
    expect(canViewAlerts(['event_operator'])).toBe(true);
    expect(canViewAlerts(['fulfiller'])).toBe(false);
    expect(canViewOnCallRota(['on_call'])).toBe(true);
    expect(canViewOnCallRota(['user'])).toBe(false);
  });

  it('mirrors reporting and improvement gates', () => {
    expect(hasReportingViewRole(['report_viewer'])).toBe(true);
    expect(hasReportingCreateRole(['report_viewer'])).toBe(false);
    expect(hasReportingCreateRole(['report_creator'])).toBe(true);
    expect(canAccessImprovements(['problem'])).toBe(true);
    expect(canAccessImprovements(['user'])).toBe(false);
  });

  it('treats admin as fulfiller-equivalent for agent checks', () => {
    expect(isFulfillerRole(['admin'])).toBe(true);
    expect(isFulfillerRole(['fulfiller'])).toBe(true);
    expect(isFulfillerRole(['user'])).toBe(false);
  });
});
