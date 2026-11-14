/* SPDX-License-Identifier: AGPL-3.0-only */

export type WorkLogEntityType = 'incident' | 'request_task' | 'problem_task' | 'change';

export interface WorkLog {
  id: string;
  entity_type: WorkLogEntityType;
  entity_id: string;
  user_id: string;
  user_name: string | null;
  minutes: number;
  worked_on: string;
  note: string | null;
  is_customer_visible: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkLogCreatePayload = {
  entity_type: WorkLogEntityType;
  entity_id: string;
  minutes: number;
  worked_on?: string;
  note?: string | null;
  is_customer_visible?: boolean;
};

export type WorkLogUpdatePayload = {
  minutes?: number;
  worked_on?: string;
  note?: string | null;
  is_customer_visible?: boolean;
};
