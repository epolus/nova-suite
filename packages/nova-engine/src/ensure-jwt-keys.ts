/* SPDX-License-Identifier: AGPL-3.0-only */
// Creates the RS256 signing key pair on first boot if it is not already present.
// Runs as a one-shot job before the API starts so that a deployment pulled from
// a registry needs no key material prepared by hand.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MODULUS_LENGTH = 2048;

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

export function ensureJwtKeys(): void {
  const privatePath = env('JWT_PRIVATE_KEY_PATH', '/secrets/jwt-private.pem');
  const publicPath = env('JWT_PUBLIC_KEY_PATH', '/secrets/jwt-public.pem');

  if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
    console.log('[nova-keygen] Inline JWT keys are configured; nothing to generate');
    return;
  }

  const hasPrivate = existsSync(privatePath);
  const hasPublic = existsSync(publicPath);

  if (hasPrivate && hasPublic) {
    console.log(`[nova-keygen] Key pair already present at ${privatePath}`);
    return;
  }

  // Replacing only half a pair would produce tokens the API cannot verify, and
  // regenerating a live private key would invalidate every issued session.
  if (hasPrivate !== hasPublic) {
    const present = hasPrivate ? privatePath : publicPath;
    const missing = hasPrivate ? publicPath : privatePath;
    throw new Error(
      `Incomplete JWT key pair: ${present} exists but ${missing} does not. `
      + 'Remove the remaining file to generate a fresh pair, or restore the missing one.',
    );
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: MODULUS_LENGTH,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  mkdirSync(dirname(privatePath), { recursive: true });
  mkdirSync(dirname(publicPath), { recursive: true });
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(publicPath, publicKey, { mode: 0o644 });

  console.log(`[nova-keygen] Generated ${MODULUS_LENGTH}-bit RS256 key pair:`);
  console.log(`[nova-keygen]   ${privatePath}`);
  console.log(`[nova-keygen]   ${publicPath}`);
}

if (require.main === module) {
  try {
    ensureJwtKeys();
  } catch (err) {
    console.error('[nova-keygen] Failed', err);
    process.exit(1);
  }
}
