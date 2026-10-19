/* SPDX-License-Identifier: AGPL-3.0-only */

export function changeImprovementAllowed(success: boolean | null | undefined): boolean {
  return success === false;
}

export function problemImprovementAllowed(permanentFix: string | null | undefined): boolean {
  return typeof permanentFix === 'string' && permanentFix.trim().length > 0;
}
