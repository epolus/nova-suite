/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – RS256 access-token helpers ───
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../logger';
import type { AuthUser } from './types';

function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : undefined;
}

function loadPemFromEnvOrFile(envName: string, pathName: string): string | undefined {
  const inline = readOptionalEnv(envName);
  if (inline) return normalizePem(inline);
  const path = readOptionalEnv(pathName);
  if (!path) return undefined;
  return readFileSync(path, 'utf8');
}

type JwtKeyPair = {
  privateKey: KeyObject;
  publicKey: KeyObject;
  source: 'env' | 'file' | 'ephemeral';
};

function loadConfiguredKeyPair(): JwtKeyPair | null {
  const privatePem = loadPemFromEnvOrFile('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_PATH');
  const publicPem = loadPemFromEnvOrFile('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_PATH');

  if (!privatePem && !publicPem) return null;
  if (!privatePem || !publicPem) {
    throw new Error(
      'JWT RS256 requires both private and public keys '
      + '(JWT_PRIVATE_KEY + JWT_PUBLIC_KEY, or JWT_PRIVATE_KEY_PATH + JWT_PUBLIC_KEY_PATH)',
    );
  }

  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(publicPem);
  const source: JwtKeyPair['source'] =
    readOptionalEnv('JWT_PRIVATE_KEY') || readOptionalEnv('JWT_PUBLIC_KEY') ? 'env' : 'file';
  return { privateKey, publicKey, source };
}

function createEphemeralKeyPair(): JwtKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, publicKey, source: 'ephemeral' };
}

function resolveKeyPair(): JwtKeyPair {
  const configured = loadConfiguredKeyPair();
  if (configured) return configured;

  if (config.nodeEnv === 'production') {
    throw new Error(
      'JWT RS256 keys are required in production. '
      + 'Set JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH.',
    );
  }

  logger.warn(
    'JWT RS256 keys not configured; using ephemeral in-memory RSA key pair. '
    + 'Tokens will be invalid after process restart.',
  );
  return createEphemeralKeyPair();
}

const keys = resolveKeyPair();

export function signAccessToken(payload: AuthUser): string {
  return jwt.sign(payload, keys.privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AuthUser & { role?: string } {
  return jwt.verify(token, keys.publicKey, {
    algorithms: ['RS256'],
  }) as AuthUser & { role?: string };
}
