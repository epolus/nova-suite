#!/usr/bin/env node
/**
 * Bump the Nova Suite release version in lockstep across workspaces and docs.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 *   node scripts/bump-version.mjs 0.2.0
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const WORKSPACES = [
  '.',
  'packages/nova-shared',
  'packages/nova-engine',
  'packages/nova-web',
  'packages/nova-worker',
];
const DOC_FILES = [
  'QUICKSTART.md',
  'docs/ENVIRONMENT.md',
  'docs/dockerhub/nova-suite.md',
  'docker-compose.deploy.yml',
  '.env.deploy.example',
  '.github/workflows/docker-publish.yml',
];

function usage() {
  console.error(`Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>`);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

function writeJson(relPath, value) {
  writeFileSync(join(root, relPath), `${JSON.stringify(value, null, 2)}\n`);
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
  if (!SEMVER.test(arg)) {
    usage();
    process.exit(1);
  }
  return arg;
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

function replaceVersion(relPath, from, to) {
  const abs = join(root, relPath);
  const before = readFileSync(abs, 'utf8');
  if (!before.includes(from)) {
    throw new Error(`${relPath} does not contain ${from}`);
  }
  writeFileSync(abs, before.split(from).join(to));
}

const current = readJson('package.json').version;
if (!SEMVER.test(current)) {
  throw new Error(`Root package.json version is not x.y.z: ${current}`);
}
const next = parseTarget(current);
if (next === current) {
  console.error(`Already at ${current}`);
  process.exit(1);
}

for (const workspace of WORKSPACES) {
  setWorkspaceVersion(workspace, next);
}
for (const file of DOC_FILES) {
  replaceVersion(file, current, next);
}

execFileSync('npm', ['install', '--package-lock-only'], {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Bumped ${current} → ${next}`);
