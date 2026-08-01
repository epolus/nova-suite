/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CIClass } from '../../api/client';

export type CIAttrDef = { type: string; reference_table?: string };

export function resolveClassAttrs(
  classId: string | undefined,
  allClasses: CIClass[],
): Record<string, CIAttrDef> {
  const result: Record<string, CIAttrDef> = {};
  if (!classId) return result;
  const visited = new Set<string>();
  let cls = allClasses.find((c) => c.id === classId);
  const chain: CIClass[] = [];
  while (cls && !visited.has(cls.id)) {
    visited.add(cls.id);
    chain.unshift(cls);
    cls = cls.parent_class ? allClasses.find((c) => c.id === cls!.parent_class) : undefined;
  }
  for (const c of chain) {
    for (const [key, val] of Object.entries(c.attributes)) {
      if (!result[key]) result[key] = val;
    }
  }
  return result;
}

export function classEmoji(icon?: string): string {
  return icon === 'server' ? '🖥️'
    : icon === 'network' ? '🌐'
      : icon === 'database' ? '🗄️'
        : icon === 'application' ? '📱'
          : icon === 'storage' ? '💾' : '📦';
}
