/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Read-only ServiceNow discovery probe for the catalog migrator.
 *
 *   SN_INSTANCE=acme SN_CREDENTIAL='user:password' npx tsx scripts/sn-probe.ts
 *   SN_INSTANCE=acme SN_CREDENTIAL='{"auth_type":"oauth2_client_credentials",...}' \
 *     npx tsx scripts/sn-probe.ts --items <sys_id>,<sys_id> --fixtures packages/nova-shared/src/migrators/servicenow/__fixtures__/live
 *
 * Without --items it only reports table access, flow storage (v1/v2) and value encoding.
 * With --items it also extracts those catalog items, runs the transform, and (with --fixtures)
 * writes a sanitized snapshot plus the converted package/report for golden tests.
 * Requires `npm run build --workspace=packages/nova-shared` first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformServiceNowSnapshot, type ServiceNowSnapshot } from '@nova-suite/shared/migrators/servicenow';
import {
  extractServiceNowSnapshot,
  normalizeServiceNowInstanceUrl,
  parseServiceNowCredentialSecret,
  probeServiceNowInstance,
  ServiceNowClient,
} from '@nova-suite/shared/node';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Masks emails and the instance host so fixtures can be committed. */
function sanitize(snapshot: ServiceNowSnapshot): ServiceNowSnapshot {
  const host = new URL(snapshot.instanceUrl).host;
  const text = JSON.stringify(snapshot)
    .replace(EMAIL_RE, 'user@example.com')
    .split(host)
    .join('example.service-now.com');
  return JSON.parse(text) as ServiceNowSnapshot;
}

async function main(): Promise<void> {
  const instance = process.env.SN_INSTANCE ?? arg('instance');
  const secret = process.env.SN_CREDENTIAL ?? arg('credential');
  if (!instance || !secret) {
    console.error('Set SN_INSTANCE and SN_CREDENTIAL (or pass --instance/--credential).');
    process.exit(2);
  }
  const instanceUrl = normalizeServiceNowInstanceUrl(instance);
  const client = new ServiceNowClient({ instanceUrl, auth: parseServiceNowCredentialSecret(secret, instanceUrl) });

  const probe = await probeServiceNowInstance(client);
  console.log(`Instance: ${probe.instanceUrl}`);
  console.log(`Release:  ${probe.release ?? 'unknown'}`);
  console.log(`Flow storage: ${probe.flowStorage}; v2 value encoding: ${probe.valueEncoding}`);
  console.table(probe.tables.map((t) => ({ table: t.table, ok: t.ok, status: t.status, rows: t.total ?? '' })));
  for (const m of probe.messages) console.log(`- ${m}`);
  if (!probe.ok) process.exitCode = 1;

  const items = arg('items');
  if (!items) return;
  const snapshot = await extractServiceNowSnapshot(
    client,
    { itemIds: items.split(',').map((s) => s.trim()).filter(Boolean) },
    (stage, detail) => console.log(`[extract] ${stage}${detail ? ` ${JSON.stringify(detail)}` : ''}`),
  );
  const { report, package: pkg } = transformServiceNowSnapshot(snapshot, { schemaVersion: 'v00.01.23' });
  console.log(JSON.stringify(report.totals, null, 2));
  for (const item of report.items) {
    console.log(`${item.status.padEnd(11)} ${item.name}`);
    for (const n of item.notes) console.log(`    [${n.severity}] ${n.subject ? `${n.subject}: ` : ''}${n.message}`);
  }
  console.log(`Requests made: ${client.requestCount}`);

  const dir = arg('fixtures');
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const clean = sanitize(snapshot);
    writeFileSync(join(dir, 'snapshot.json'), `${JSON.stringify(clean, null, 2)}\n`);
    const out = transformServiceNowSnapshot(clean, { schemaVersion: 'v00.01.23', now: new Date('2026-01-01T00:00:00Z') });
    writeFileSync(join(dir, 'expected-package.json'), `${JSON.stringify(out.package, null, 2)}\n`);
    writeFileSync(join(dir, 'expected-report.json'), `${JSON.stringify(out.report, null, 2)}\n`);
    console.log(`Wrote sanitized fixtures to ${dir} (package size ${JSON.stringify(pkg).length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
