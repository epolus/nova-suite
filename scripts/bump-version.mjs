#!/usr/bin/env node
/**
 * Bump the Nova Suite release version in lockstep across workspaces, source, and docs.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 *   node scripts/bump-version.mjs 0.1.3
 *   node scripts/bump-version.mjs v00.01.03
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const PADDED = /^v(\d{2})\.(\d{2})\.(\d{2})$/;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.example',
]);
const TEXT_NAMES = new Set([
  'Dockerfile',
  'Caddyfile',
  '.env.example',
  '.env.deploy.example',
]);
const WORKSPACES = [
  '.',
  'packages/nova-shared',
  'packages/nova-engine',
  'packages/nova-web',
  'packages/nova-worker',
];

function usage() {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z|vxx.xx.xx>');
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

function writeJson(relPath, value) {
  writeFileSync(join(root, relPath), `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeVersion(input) {
  const padded = PADDED.exec(input);
  if (padded) {
    return `${Number(padded[1])}.${Number(padded[2])}.${Number(padded[3])}`;
  }
  const match = SEMVER.exec(input);
  if (!match) {
    return null;
  }
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function bumpSemver(version, part) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`Not a x.y.z version: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (part === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (part === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function parseTarget(current) {
  const arg = process.argv[2];
  if (!arg) {
    usage();
    process.exit(1);
  }
  if (arg === 'patch' || arg === 'minor' || arg === 'major') {
    return bumpSemver(current, arg);
  }
  const next = normalizeVersion(arg);
  if (!next) {
    usage();
    process.exit(1);
  }
  return next;
}

function setWorkspaceVersion(relDir, version) {
  const relPath = relDir === '.' ? 'package.json' : join(relDir, 'package.json');
  const pkg = readJson(relPath);
  pkg.version = version;
  if (pkg.dependencies?.['@nova-suite/shared']) {
    pkg.dependencies['@nova-suite/shared'] = version;
  }
  writeJson(relPath, pkg);
}

function versionTokenRe(version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow a trailing sentence period (`web-0.1.2.`) but not a longer number (`0.1.2.3`).
  return new RegExp(`(?<![0-9.vV])${escaped}(?!\\.\\d)`, 'g');
}

function shouldScan(filePath) {
  const name = filePath.split(/[/\\]/).pop() || '';
  const rel = relative(root, filePath);
  if (rel === 'scripts/bump-version.mjs') {
    return false;
  }
  if (name === 'package-lock.json' || name === 'package.json') {
    return false;
  }
  if (TEXT_NAMES.has(name)) {
    return true;
  }
  return TEXT_EXTS.has(extname(name));
}

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkFiles(abs, acc);
    } else if (shouldScan(abs)) {
      acc.push(abs);
    }
  }
  return acc;
}

function replaceInTree(from, to) {
  const re = versionTokenRe(from);
  const changed = [];
  for (const abs of walkFiles(root)) {
    const before = readFileSync(abs, 'utf8');
    const after = before.replace(re, to);
    if (after !== before) {
      writeFileSync(abs, after);
      changed.push(relative(root, abs));
    }
  }
  return changed;
}

const current = normalizeVersion(readJson('package.json').version);
if (!current) {
  throw new Error(`Root package.json version is not x.y.z: ${readJson('package.json').version}`);
}
const next = parseTarget(current);
if (next === current) {
  console.error(`Already at ${current}`);
  process.exit(1);
}

for (const workspace of WORKSPACES) {
  setWorkspaceVersion(workspace, next);
}
const changed = replaceInTree(current, next);

execFileSync('npm', ['install', '--package-lock-only'], {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Bumped ${current} → ${next}`);
if (changed.length) {
  console.log(changed.sort().map((file) => `  ${file}`).join('\n'));
}
