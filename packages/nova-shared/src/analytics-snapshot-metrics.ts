/* SPDX-License-Identifier: AGPL-3.0-only */

export type SnapshotTrendMetric = {
  dataset: string;
  metric: string;
  countSql: string;
};

export const SNAPSHOT_TREND_METRICS: SnapshotTrendMetric[] = [
  {
    dataset: 'incidents',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM incidents WHERE status NOT IN ('closed','cancelled')`,
  },
  {
    dataset: 'changes',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM changes WHERE status NOT IN ('closed','cancelled','rejected')`,
  },
  {
    dataset: 'requests',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM requests WHERE status NOT IN ('fulfilled','cancelled')`,
  },
  {
    dataset: 'problems',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM problems WHERE status NOT IN ('resolved','closed')`,
  },
];
