#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const viteArgs = [];
// The flags this launcher owns, each handed to Vite as an absolute path in its
// environment variable; everything else is Vite's.
const OWN_FLAGS = { '--data-dir': 'BOARDOWN_DATA_DIR', '--config-dir': 'BOARDOWN_CONFIG_DIR' };
const values = {};

const take = (flag, value) => {
  if (value === undefined || value === '') {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  return value;
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--') {
    continue;
  }
  const eq = arg.indexOf('=');
  const flag = eq === -1 ? arg : arg.slice(0, eq);
  if (!(flag in OWN_FLAGS)) {
    viteArgs.push(arg);
    continue;
  }
  if (eq === -1) {
    values[flag] = take(flag, args[i + 1]);
    i += 1;
  } else {
    values[flag] = take(flag, arg.slice(eq + 1));
  }
}

// Relative to where the command was typed, not to packages/web where pnpm runs
// this. A BOARDOWN_CONFIG_DIR set by the caller is resolved the same way, and a
// flag beats it.
const invocationCwd = process.env.INIT_CWD ?? process.cwd();
if (values['--data-dir'] !== undefined) {
  process.env.BOARDOWN_DATA_DIR = path.resolve(invocationCwd, values['--data-dir']);
}
const configDir = values['--config-dir'] ?? process.env.BOARDOWN_CONFIG_DIR;
if (configDir !== undefined && configDir !== '') {
  process.env.BOARDOWN_CONFIG_DIR = path.resolve(invocationCwd, configDir);
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
