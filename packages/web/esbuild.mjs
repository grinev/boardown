#!/usr/bin/env node
import { chmod } from 'node:fs/promises';
import esbuild from 'esbuild';

// The server half of the package: one CJS file next to the built client, with
// every workspace dependency inlined so the installed tarball resolves nothing.
const options = {
  entryPoints: ['src/server/bin.ts'],
  outfile: 'dist/boardown-web.cjs',
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
  console.log('[web] watching the server bundle for changes…');
} else {
  await esbuild.build(options);
  await chmod(options.outfile, 0o755);
}
