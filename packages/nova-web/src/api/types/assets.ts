/* SPDX-License-Identifier: AGPL-3.0-only */
export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  category: string;
  status: string;
  owner_user_id: string | null;
  linked_ci_id: string | null;
  vendor_name: string | null;
  purchase_cost: number | null;
  purchase_currency: string;
  purchase_date: string | null;
  warranty_expires_at: string | null;
  contract_ref: string | null;
  depreciation_months: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  linked_ci_name?: string;
}

export interface Release {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  release_type: string;
  risk_level: string;
  planned_start: string | null;
  planned_end: string | null;
  deployed_at: string | null;
  owner_user_id: string | null;
  change_id: string | null;
  validation_notes: string | null;
  rollback_plan: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  change_number?: string;
  change_title?: string;
}
