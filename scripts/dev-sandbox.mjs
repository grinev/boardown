#!/usr/bin/env node

// Boots the web shell against a throwaway copy of tests/fixtures/board/.boardown
// so an agent can click the board (creating, editing and deleting tasks) without
// touching the repo's own .boardown/ or dirtying the fixture in git.

import { spawn } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PORT = '5199';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'board', '.boardown');

const projectRoot = await mkdtemp(path.join(tmpdir(), 'boardown-sandbox-'));
const sandbox = path.join(projectRoot, '.boardown');
await cp(fixture, sandbox, { recursive: true });

// Repo file links (`[[repo:…]]`) resolve against the *project* folder — the one
// holding .boardown/ — which in a sandbox is an empty temp directory. Seed it
// with one file of each kind the preview has to tell apart, so the feature can
// be exercised here instead of against the real repo.
const SEEDED = [
  ['README.md', 'README.md'],
  ['package.json', 'package.json'],
  ['scripts/dev-sandbox.mjs', 'scripts/dev-sandbox.mjs'],
  ['packages/vscode/icon.png', 'assets/icon.png'],
];
for (const [from, to] of SEEDED) {
  await cp(path.join(repoRoot, from), path.join(projectRoot, to));
}
await writeFile(path.join(projectRoot, 'huge.log'), 'x'.repeat(1024 * 1024 + 1), 'utf-8');

console.log(`sandbox board: ${sandbox}`);
console.log(`sandbox files: ${SEEDED.map(([, to]) => to).join(', ')}, huge.log`);
console.log(`sandbox url:   http://localhost:${PORT}`);

const child = spawn(
  'pnpm',
  [
    '--filter',
    '@boardown/web',
    'dev',
    '--',
    '--data-dir',
    sandbox,
    '--port',
    PORT,
    '--strictPort',
  ],
  {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
);

child.on('error', (err) => {
  console.error(err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
