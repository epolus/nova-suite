/* SPDX-License-Identifier: AGPL-3.0-only */

export type ActivityKind = 'journal' | 'work_log' | 'email';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  actor: string;
  summary: string;
  body: string;
};

type JournalLike = {
  id: string;
  created_at: string;
  author_name?: string | null;
  entry_type: string;
  content: string;
};

type WorkLogLike = {
  id: string;
  created_at: string;
  user_name?: string | null;
  minutes: number;
  note?: string | null;
};

type EmailLike = {
  id: string;
  created_at: string;
  direction: string;
  from_address: string;
  subject: string;
  body_text?: string | null;
};

export function mergeActivity(input: {
  journal?: JournalLike[];
  workLogs?: WorkLogLike[];
  emails?: EmailLike[];
}): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const entry of input.journal ?? []) {
    items.push({
      id: `journal:${entry.id}`,
      kind: 'journal',
      at: entry.created_at,
      actor: entry.author_name ?? '',
      summary: entry.entry_type,
      body: entry.content,
    });
  }
  for (const entry of input.workLogs ?? []) {
    items.push({
      id: `work_log:${entry.id}`,
      kind: 'work_log',
      at: entry.created_at,
      actor: entry.user_name ?? '',
      summary: String(entry.minutes),
      body: entry.note ?? '',
    });
  }
  for (const entry of input.emails ?? []) {
    items.push({
      id: `email:${entry.id}`,
      kind: 'email',
      at: entry.created_at,
      actor: entry.from_address,
      summary: entry.subject || entry.direction,
      body: entry.body_text ?? '',
    });
  }
  items.sort((a, b) => {
    const byTime = a.at.localeCompare(b.at);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
  return items;
}
