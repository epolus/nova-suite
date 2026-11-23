/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { mergeActivity } from './mergeActivity';

describe('mergeActivity', () => {
  it('orders journal, work logs, and email by time even when the journal arrives newest-first', () => {
    const items = mergeActivity({
      journal: [
        {
          id: 'j2',
          created_at: '2026-11-23T12:00:00.000Z',
          author_name: 'Ada',
          entry_type: 'comment',
          content: 'Later note',
        },
        {
          id: 'j1',
          created_at: '2026-11-23T09:00:00.000Z',
          author_name: 'Ada',
          entry_type: 'work_note',
          content: 'Earlier note',
        },
      ],
      workLogs: [
        {
          id: 'w1',
          created_at: '2026-11-23T10:00:00.000Z',
          user_name: 'Bea',
          minutes: 15,
          note: 'Checked the mailbox',
        },
      ],
      emails: [
        {
          id: 'e1',
          created_at: '2026-11-23T11:00:00.000Z',
          direction: 'inbound',
          from_address: 'sam@example.com',
          subject: 'Still down',
          body_text: 'Any update?',
        },
      ],
    });

    expect(items.map((item) => item.id)).toEqual([
      'journal:j1',
      'work_log:w1',
      'email:e1',
      'journal:j2',
    ]);
    expect(items[1]).toMatchObject({ kind: 'work_log', summary: '15', actor: 'Bea' });
    expect(items[2]).toMatchObject({ kind: 'email', summary: 'Still down', body: 'Any update?' });
  });
});
