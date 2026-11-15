/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Patch IDs for `patched()` / `deprecatePatch()`. Any change to the commands a
 * workflow issues (activities, timers, child workflows, their order) must be
 * gated behind a patch so in-flight executions replay. Never reuse an ID.
 * See "Temporal Workflow Versioning" in docs/UPGRADE_STRATEGY.md for removal.
 */
export const WORKFLOW_PATCHES = {
  dataSourceFailOrphanRun: 'datasource-sync/fail-orphan-run',
} as const;
