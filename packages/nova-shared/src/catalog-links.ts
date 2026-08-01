/* SPDX-License-Identifier: AGPL-3.0-only */

export interface CatalogItemLink {
  id: string;
  name: string;
  path: string;
}

const CATALOG_ITEM_ID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function addCatalogItem(items: Map<string, CatalogItemLink>, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const record = raw as Record<string, unknown>;
  const id = record.id != null ? String(record.id) : '';
  const path = record.path != null ? String(record.path) : '';
  const name = record.name != null ? String(record.name) : 'Catalog item';
  if (id && path.startsWith('/catalog/')) {
    items.set(id.toLowerCase(), { id, name, path });
  }
}

/** Catalog items returned by search_catalog / get_catalog_item in this conversation. */
export function collectCatalogItemsFromMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
): CatalogItemLink[] {
  const byId = new Map<string, CatalogItemLink>();
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    try {
      const data = JSON.parse(message.content) as Record<string, unknown>;
      if (Array.isArray(data.items)) {
        for (const item of data.items) addCatalogItem(byId, item);
      }
      if (data.item) addCatalogItem(byId, data.item);
    } catch {
      // ignore non-JSON tool output
    }
  }
  return [...byId.values()];
}

/** Collect `/catalog/:id` paths from catalog tool JSON in the conversation. */
export function collectCatalogPathsFromMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
): Map<string, string> {
  const paths = new Map<string, string>();
  for (const item of collectCatalogItemsFromMessages(messages)) {
    paths.set(item.id.toLowerCase(), item.path);
  }
  return paths;
}

function catalogPathForId(id: string, knownPaths?: ReadonlyMap<string, string>): string {
  return knownPaths?.get(id.toLowerCase()) ?? `/catalog/${id}`;
}

function replaceKnownCatalogIds(text: string, knownPaths: ReadonlyMap<string, string>): string {
  let out = text;
  for (const [id, path] of knownPaths) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\(\\s*ID:\\s*${escapedId}\\s*\\)`, 'gi'), path);
    out = out.replace(new RegExp(`(?<![-/])${escapedId}(?![-/\\w])`, 'gi'), path);
    out = out.replace(new RegExp(`[„""']${escapedPath}[„""']`, 'g'), path);
  }
  return out;
}

function stripInventedExternalLinks(text: string): string {
  return text
    .replace(/\[https?:\/\/[^\]]+\]/gi, '')
    .replace(/<?https?:\/\/tools\.org[^>\s\])"]*>?/gi, '')
    .replace(/<?https?:\/\/catalog\.example\.com[^>\s\])"]*>?/gi, '')
    .replace(/<?https?:\/\/[^/\s>\])"]*example\.com[^>\s>\])"]*>?/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Rewrite invented catalog URLs (e.g. catalog.example.com) to in-app `/catalog/:id` paths. */
export function normalizeCatalogLinksInText(
  text: string,
  knownPaths?: ReadonlyMap<string, string>,
): string {
  let out = text;

  if (knownPaths?.size) {
    for (const [id, path] of knownPaths) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(
        new RegExp(`<?https?:\\/\\/[^>\\s]*${escapedId}[^>\\s]*>?`, 'gi'),
        path,
      );
    }
    out = replaceKnownCatalogIds(out, knownPaths);
  }

  out = out.replace(
    /<?https?:\/\/catalog\.example\.com\/([0-9a-f-]{36})>?/gi,
    (_, id: string) => catalogPathForId(id, knownPaths),
  );

  out = out.replace(
    /<?https?:\/\/[^/\s<>)"]+\/catalog\/([0-9a-f-]{36})>?/gi,
    (_, id: string) => catalogPathForId(id, knownPaths),
  );

  out = out.replace(
    /<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi,
    (_, id: string) => catalogPathForId(id, knownPaths),
  );

  return stripInventedExternalLinks(out);
}

/** Normalize assistant text and ensure catalog items link to in-app paths from tool results. */
export function enrichCatalogAssistantReply(
  text: string,
  messages: ReadonlyArray<{ role: string; content: string }>,
): string {
  const items = collectCatalogItemsFromMessages(messages);
  if (items.length === 0) {
    return normalizeCatalogLinksInText(text);
  }

  const paths = new Map(items.map((item) => [item.id.toLowerCase(), item.path]));
  let out = normalizeCatalogLinksInText(text, paths);

  const hasCatalogPath = items.some((item) => out.includes(item.path));
  if (!hasCatalogPath) {
    const block = items.map((item) => `${item.path} (${item.name})`).join('\n');
    out = `${out}\n\n${block}`.trim();
  }

  return out;
}

export function looksLikeCatalogItemId(value: string): boolean {
  return CATALOG_ITEM_ID.test(value);
}
