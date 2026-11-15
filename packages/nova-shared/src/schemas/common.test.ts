/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { loginSchema, paginationSchema, createIncidentSchema } from './index';

describe('shared API schemas', () => {
  it('applies pagination defaults and coerces strings', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationSchema.parse({ page: '2', limit: '5' })).toEqual({ page: 2, limit: 5 });
  });

  it('rejects invalid login emails', () => {
    expect(() => loginSchema.parse({ email: 'not-an-email', password: 'x' })).toThrow();
    expect(loginSchema.parse({ email: 'a@b.co', password: 'x' })).toEqual({
      email: 'a@b.co',
      password: 'x',
    });
  });

  it('requires an incident title and defaults impact/urgency', () => {
    expect(() => createIncidentSchema.parse({})).toThrow();
    expect(createIncidentSchema.parse({ title: 'Outage' })).toMatchObject({
      title: 'Outage',
      impact: 'medium',
      urgency: 'medium',
    });
  });
});
