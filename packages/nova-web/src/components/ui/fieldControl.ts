/* SPDX-License-Identifier: AGPL-3.0-only */
import { useId } from 'react';

/** Stable id/name pair for associating labels with form controls. */
export function useFieldControl(name?: string, explicitId?: string) {
  const autoId = useId();
  const id = explicitId ?? (name ? sanitizeFieldId(name) : autoId);
  return { id, name: name ?? id };
}

export function sanitizeFieldId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
