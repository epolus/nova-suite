/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

// Unit-test form_schema summarization via getCatalogItemDetail logic
function summarizeFormSchema(raw: unknown) {
  if (!raw || typeof raw !== 'object') return [];
  const fields = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      name: String(f.name ?? ''),
      label: String(f.label ?? f.name ?? ''),
      type: String(f.type ?? 'text'),
      required: f.required === true,
    }))
    .filter((f) => f.name);
}

describe('catalog form schema summary', () => {
  it('extracts field labels for assistant context', () => {
    const fields = summarizeFormSchema({
      fields: [
        { name: 'os_preference', label: 'Operating System', type: 'select', required: true },
        { name: 'reason', label: 'Business Justification', type: 'textarea', required: true },
      ],
    });
    expect(fields).toHaveLength(2);
    expect(fields[0].label).toBe('Operating System');
  });
});
