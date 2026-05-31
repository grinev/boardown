import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

// The webview bundle is loaded by the extension host as static assets with
// fixed names, so it can reference them without parsing a hashed index.html.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(here, 'src/webview/main.tsx'),
      output: {
        entryFileNames: 'webview.js',
        assetFileNames: 'webview.[ext]',
      },
    },
  },
});
