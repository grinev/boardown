#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const viteArgs = [];
let dataDir;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--') {
    continue;
  }
  if (arg === '--data-dir') {
    const value = args[i + 1];
    if (value === undefined || value === '') {
      console.error('Missing value for --data-dir');
      process.exit(1);
    }
    dataDir = value;
    i += 1;
    continue;
  }
  if (arg.startsWith('--data-dir=')) {
    const value = arg.slice('--data-dir='.length);
    if (value === '') {
      console.error('Missing value for --data-dir');
      process.exit(1);
    }
    dataDir = value;
    continue;
  }
  viteArgs.push(arg);
}

if (dataDir !== undefined) {
  const invocationCwd = process.env.INIT_CWD ?? process.cwd();
  process.env.BOARDOWN_DATA_DIR = path.resolve(invocationCwd, dataDir);
}

const viteBin = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const child = spawn(viteBin, viteArgs, {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

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
