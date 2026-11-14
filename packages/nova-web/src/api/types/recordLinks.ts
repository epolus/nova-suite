/* SPDX-License-Identifier: AGPL-3.0-only */
export type RecordLinkEntityType =
  | 'incident'
  | 'request'
  | 'problem'
  | 'change'
  | 'configuration_item'
  | 'asset';

export type RecordLinkType = 'related' | 'parent' | 'duplicate';

export interface RecordLink {
  id: string;
  source_type: RecordLinkEntityType;
  source_id: string;
  target_type: RecordLinkEntityType;
  target_id: string;
  link_type: RecordLinkType;
  created_by: string | null;
  created_at: string;
  other_type: RecordLinkEntityType;
  other_id: string;
  other_identifier: string;
  other_title: string;
  other_status: string | null;
  other_path: string;
  direction: 'outgoing' | 'incoming';
}

export interface RecordLinkSearchHit {
  id: string;
  entity_type: RecordLinkEntityType;
  identifier: string;
  title: string;
  status: string | null;
  path: string;
}
