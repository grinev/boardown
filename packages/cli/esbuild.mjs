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
  // The agent skill is embedded as a string, so `skill install` needs nothing
  // shipped next to the bundle.
  loader: { '.md': 'text' },
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
