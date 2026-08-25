#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The build writes two artifacts into dist/ — the client bundle and the server
// bundle — and Vite only empties its own subdirectory. Without this, a file left
// by an older layout survives and `files: ["dist"]` packs it into the tarball.
const here = path.dirname(fileURLToPath(import.meta.url));
await rm(path.resolve(here, '..', 'dist'), { recursive: true, force: true });
