/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readPackageVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  if (!pkg.version) {
    throw new Error(`Missing version in ${pkgPath}`);
  }
  return pkg.version;
}

/** Release version from packages/nova-engine/package.json (src or dist). */
export const APP_VERSION = readPackageVersion();
