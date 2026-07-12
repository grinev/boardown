#!/usr/bin/env node

// Boots the web shell against a throwaway copy of tests/fixtures/board/.boardown
// so an agent can click the board (creating, editing and deleting tasks) without
// touching the repo's own .boardown/ or dirtying the fixture in git.

import { spawn } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PORT = '5199';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'board', '.boardown');

const sandbox = path.join(await mkdtemp(path.join(tmpdir(), 'boardown-sandbox-')), '.boardown');
await cp(fixture, sandbox, { recursive: true });

console.log(`sandbox board: ${sandbox}`);
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
