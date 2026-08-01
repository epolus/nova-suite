/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  collectCatalogItemsFromMessages,
  collectCatalogPathsFromMessages,
  enrichCatalogAssistantReply,
  normalizeCatalogLinksInText,
} from '@nova-suite/shared';

describe('normalizeCatalogLinksInText', () => {
  const itemId = 'd0000000-0000-0000-0000-000000000001';
  const paths = new Map([[itemId, `/catalog/${itemId}`]]);

  it('rewrites catalog.example.com markdown links', () => {
    const input = `Link: <https://catalog.example.com/${itemId}>`;
    expect(normalizeCatalogLinksInText(input, paths)).toBe(`Link: /catalog/${itemId}`);
  });

  it('rewrites plain catalog.example.com URLs', () => {
    const input = `https://catalog.example.com/${itemId}`;
    expect(normalizeCatalogLinksInText(input, paths)).toBe(`/catalog/${itemId}`);
  });

  it('replaces bare quoted catalog item ids', () => {
    const input = `Klicke auf die Link „${itemId}" im Ergebnis.`;
    expect(normalizeCatalogLinksInText(input, paths)).toBe(
      `Klicke auf die Link /catalog/${itemId} im Ergebnis.`,
    );
  });

  it('replaces (ID: uuid) with catalog path', () => {
    const input = `Wähle "New Laptop" aus (ID: ${itemId}).`;
    expect(normalizeCatalogLinksInText(input, paths)).toBe(
      `Wähle "New Laptop" aus /catalog/${itemId}.`,
    );
  });

  it('strips invented external markdown links', () => {
    const input = `Besuche den Service-Katalog unter [https://tools.org] und suche nach "Hardware".`;
    expect(normalizeCatalogLinksInText(input, paths)).toBe(
      `Besuche den Service-Katalog unter und suche nach "Hardware".`,
    );
  });

  it('collects paths from search_catalog tool output', () => {
    const collected = collectCatalogPathsFromMessages([
      {
        role: 'tool',
        content: JSON.stringify({
          items: [{ id: itemId, name: 'Laptop', path: `/catalog/${itemId}` }],
        }),
      },
    ]);
    expect(collected.get(itemId)).toBe(`/catalog/${itemId}`);
  });
});

describe('enrichCatalogAssistantReply', () => {
  const itemId = 'd0000000-0000-0000-0000-000000000001';
  const toolMessages = [
    {
      role: 'tool',
      content: JSON.stringify({
        items: [{ id: itemId, name: 'New Laptop', path: `/catalog/${itemId}` }],
      }),
    },
  ];

  it('appends catalog paths when the model omits them', () => {
    const reply = enrichCatalogAssistantReply(
      'Besuche den Service-Katalog unter [https://tools.org] und suche nach Hardware.',
      toolMessages,
    );
    expect(reply).toContain(`/catalog/${itemId} (New Laptop)`);
  });

  it('collects catalog items with names', () => {
    const items = collectCatalogItemsFromMessages(toolMessages);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('New Laptop');
  });
});
