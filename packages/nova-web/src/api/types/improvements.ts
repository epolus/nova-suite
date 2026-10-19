/* SPDX-License-Identifier: AGPL-3.0-only */

export interface Improvement {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  source_type: 'manual' | 'postmortem' | 'change' | 'problem';
  major_incident_id: string | null;
  action_item_id: string | null;
  change_id: string | null;
  problem_id: string | null;
  owner_user_id: string | null;
  owner_name?: string | null;
  major_incident_number?: string | null;
  change_number?: string | null;
  problem_number?: string | null;
  created_at: string;
  updated_at: string;
}
