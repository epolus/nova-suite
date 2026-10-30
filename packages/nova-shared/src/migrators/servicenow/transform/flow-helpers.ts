/* SPDX-License-Identifier: AGPL-3.0-only */
export function subflowOutputVar(prefix: string, output: string): string {
  return `${prefix}_${output.replace(/[^A-Za-z0-9_]/g, '_')}`;
}
