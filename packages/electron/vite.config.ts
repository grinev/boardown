import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

// base './' so the packaged index.html references its assets relatively — the
// main process loads it over file://, where absolute '/assets/…' would 404.
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});
