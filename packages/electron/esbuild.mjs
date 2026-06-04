import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Main process and preload are Node/Electron code: bundle to CJS with electron
// kept external, exactly like the VS Code host. The renderer is Vite's job.
/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main/main.ts', 'src/main/preload.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: watching main + preload…');
} else {
  await esbuild.build(options);
}
