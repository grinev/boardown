import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { FileStat } from '@boardown/core';
import type { FsRequest } from '../bridge';

// Join a renderer-supplied relative path onto the board root, rejecting absolute
// paths and any '..' escape — a mirror of packages/web's dev-fs-plugin guard, so
// the renderer can never reach outside the open board's .boardown/ directory.
// Exported for unit tests: this is the sole boundary between the renderer and
// arbitrary disk paths, so its edge cases are covered directly.
export function resolveTarget(boardRoot: string, userPath: string): string | null {
  const normalized = userPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  const abs = path.resolve(boardRoot, normalized);
  const rel = path.relative(boardRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return abs;
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

// Run one FsAdapter operation against the board root. ENOENT is an expected,
// handled case for callers (missing config -> onboarding, optional backlog),
// so list -> [], stat -> null, and read -> null too: returning null instead of
// throwing keeps Electron's IPC layer from logging a stack for every absent
// file. The preload turns a null read back into the rejection FsAdapter.read
// promises, so the renderer contract is unchanged.
export async function handleFsRequest(boardRoot: string, req: FsRequest): Promise<unknown> {
  const target = resolveTarget(boardRoot, req.path);
  if (target === null) {
    throw new Error(`Invalid path: ${req.path}`);
  }

  switch (req.method) {
    case 'read':
      try {
        return await fsp.readFile(target, 'utf-8');
      } catch (err) {
        if (isENOENT(err)) return null;
        throw err;
      }
    case 'write':
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, req.content ?? '', 'utf-8');
      return undefined;
    case 'list':
      try {
        const entries = await fsp.readdir(target, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch (err) {
        if (isENOENT(err)) return [];
        throw err;
      }
    case 'stat':
      try {
        const s = await fsp.stat(target);
        return { lastModified: s.mtimeMs } satisfies FileStat;
      } catch (err) {
        if (isENOENT(err)) return null;
        throw err;
      }
  }
}
