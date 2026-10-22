/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReportComponentResult } from '../../api/client';
import { ReportResultPreview } from './reportResult';

export function ResultPreview({ result }: { result: ReportComponentResult }) {
  return <ReportResultPreview result={result} />;
}
