import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devFsPlugin } from './src/dev-fs-plugin';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const configuredDataDir = process.env.BOARDOWN_DATA_DIR;
const boardRoot = configuredDataDir
  ? path.resolve(configuredDataDir)
  : path.resolve(repoRoot, '.boardown');

export default defineConfig({
  plugins: [react(), devFsPlugin({ boardRoot })],
});
