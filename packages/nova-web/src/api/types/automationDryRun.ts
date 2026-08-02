/* SPDX-License-Identifier: AGPL-3.0-only */
export interface AutomationDryRunRequestContext {
  id?: string;
  number?: string;
  status?: string;
  form_data?: Record<string, unknown>;
  delivery_info?: Record<string, unknown>;
}

export interface AutomationDryRunResult {
  ok: boolean;
  message: string;
  rejectRequest: boolean;
  skipTaskOrders: number[];
  trace: string[];
  mergePatch: Record<string, unknown>;
  stateResults: Record<string, unknown>;
  warnings: string[];
  request_context: Record<string, unknown>;
}
