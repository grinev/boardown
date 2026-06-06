#!/usr/bin/env node
import { chmod } from 'node:fs/promises';
import esbuild from 'esbuild';

const options = {
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
};

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[cli] watching for changes…');
} else {
  await esbuild.build(options);
  await chmod(options.outfile, 0o755);
}
