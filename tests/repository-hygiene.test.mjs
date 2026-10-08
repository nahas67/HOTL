// Repository supply-chain hygiene guard.
//
// The 2026-10-08 review found that this public repository tracked three large
// ZIP snapshots, each of which embedded `.git` history and `.data` simulation
// state. That is an exposure path, not a source-control practice. These tests
// make the safe state enforceable in CI instead of advisory.
//
// Evidence: evidence/supply-chain-review-2026-10-08/README.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

const gitignore = () => readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');

test('no generated, ignored or simulation state directory is tracked', () => {
  const forbidden = /(^|\/)(\.next|\.data|\.medusa|\.turbo|node_modules|dist|artifacts|test-results|playwright-report|\.git|\.sites-checkout)(\/|$)/;
  const offenders = tracked().filter(file => forbidden.test(file));
  assert.deepEqual(offenders, [], `un-ignored generated state is tracked: ${offenders.join(', ')}`);
});

test('no tracked source file is large enough to be a binary snapshot', () => {
  // The three committed ZIP snapshots were 4.98 MB, 5.60 MB and 15.89 MB.
  const LIMIT_BYTES = 5 * 1024 * 1024;
  const rows = execFileSync('git', ['ls-files', '-s'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length >= 4)
    .map(parts => ({ path: parts.slice(3).join(' '), bytes: Number(parts[3]) }))
    .filter(row => Number.isFinite(row.bytes) && row.bytes > LIMIT_BYTES);
  assert.deepEqual(rows, [], `tracked files exceed ${LIMIT_BYTES} bytes: ${rows.map(r => `${r.path} (${r.bytes})`).join(', ')}`);
});

test('no tracked ZIP snapshot is committed to the repository', () => {
  const offenders = tracked().filter(file => /\.zip$/i.test(file));
  assert.deepEqual(offenders, [], `binary snapshot archives must not be tracked: ${offenders.join(', ')}`);
});

test('credential-bearing and local-state file types stay ignored', () => {
  const ignore = gitignore();
  for (const rule of ['.env*', '!.env.example', '*.pem', '*.key', '*.p12', '*.pfx', '*.sqlite', 'node_modules/', '.next/', '.data/', '.medusa/', 'artifacts/', '*.zip']) {
    assert.ok(ignore.split(/\r?\n/).includes(rule), `.gitignore must keep the rule ${rule}`);
  }
});

test('example environment templates are tracked and real environment files are not', () => {
  const files = tracked();
  assert.ok(files.includes('.env.example'), '.env.example must stay tracked');
  const leaked = files.filter(file => /(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example'));
  assert.deepEqual(leaked, [], `real environment files must never be tracked: ${leaked.join(', ')}`);
});

test('the gitleaks allowance stays scoped to one reviewed test file', () => {
  const config = readFileSync(resolve(repoRoot, '.gitleaks.toml'), 'utf8');
  const allowances = config.match(/guarded-payments\\\.test\\\.ts/g) ?? [];
  assert.equal(allowances.length, 1, 'exactly one allowance may name the reviewed fixture path');
  assert.ok(!/paths\s*=\s*\[\s*'''''/.test(config), 'a wildcard allowance path is never acceptable');
});
