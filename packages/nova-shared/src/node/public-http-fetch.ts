/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Outbound fetch sink for admin-configured importer/OAuth URLs.
 *
 * Kept in a dedicated file so .github/codeql/codeql-config.yml can exclude
 * this intentional sink. Callers must only pass hrefs from toPublicHttpHref()
 * after assertPublicHttpUrl() (public http(s), no credentials, private/loopback/
 * link-local/metadata hosts blocked via hostname + DNS, redirects disabled).
 */
export async function publicHttpFetch(
  href: string,
  init: RequestInit = {},
): Promise<Response> {
  // Host denylist runs in assertPublicHttpUrl before this sink.
  return fetch(href, { ...init, redirect: 'error' }); // codeql[js/request-forgery]
}
