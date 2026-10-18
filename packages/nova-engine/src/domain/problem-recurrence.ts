/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  DEFAULT_RECURRENCE_THRESHOLD,
  DEFAULT_TITLE_SIMILARITY,
} from '@nova-suite/shared';

/** Stored scan rows match the modal defaults. Other thresholds still run the live query. */
export function usesStoredRecurrenceScan(
  scanned: boolean,
  threshold: number,
  similarity: number,
): boolean {
  return scanned
    && threshold === DEFAULT_RECURRENCE_THRESHOLD
    && similarity === DEFAULT_TITLE_SIMILARITY;
}
