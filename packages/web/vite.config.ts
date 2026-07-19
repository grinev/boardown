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

// Logs always go to the repo root, never into the board being edited — so
// dev:sandbox writes next to the sources rather than into its temp board.
const logsDir = path.resolve(repoRoot, 'logs');

export default defineConfig({
  plugins: [react(), devFsPlugin({ boardRoot, logsDir })],
  define: {
    // core never reads process.env, and the browser has no environment to read,
    // so the level travels into the bundle as a build-time constant.
    __BOARDOWN_LOG_LEVEL__: JSON.stringify(process.env.BOARDOWN_LOG_LEVEL ?? ''),
  },
});
