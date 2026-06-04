#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');

// 1. Renderer dev server (HMR).
const viteServer = await createServer({ configFile: path.join(pkgRoot, 'vite.config.ts') });
await viteServer.listen();
const url = viteServer.resolvedUrls?.local[0];
if (!url) {
  console.error('Vite dev server did not report a local URL');
  process.exit(1);
}

// 2. Build + watch the main process and preload.
const ctx = await esbuild.context({
  entryPoints: [
    path.join(pkgRoot, 'src/main/main.ts'),
    path.join(pkgRoot, 'src/main/preload.ts'),
  ],
  outdir: path.join(pkgRoot, 'dist'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
});
await ctx.rebuild();
await ctx.watch();

// 3. Launch Electron against the dev server. Forward any extra args (e.g. a
// folder path) after `--` so `pnpm dev -- /path/to/project` opens it on boot.
const electronBin = (await import('electron')).default;
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const child = spawn(electronBin, [pkgRoot, ...extraArgs], {
  env: { ...process.env, BOARDOWN_RENDERER_URL: url },
  stdio: 'inherit',
});

const shutdown = async () => {
  await ctx.dispose();
  await viteServer.close();
};

child.on('exit', (code) => {
  void shutdown().finally(() => process.exit(code ?? 0));
});
child.on('error', (err) => {
  console.error(err.message);
  void shutdown().finally(() => process.exit(1));
});

// Ctrl+C reaches the whole process group; tear down Vite + esbuild before exit
// instead of leaking the watcher and the bound dev-server port.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
    void shutdown().finally(() => process.exit(0));
  });
}
