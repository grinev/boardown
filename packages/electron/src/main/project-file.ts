import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_FILE_MAX_BYTES,
  classifyProjectFile,
  type ProjectFileRead,
} from '@boardown/core';

// Join a renderer-supplied relative path onto the *project* folder — the one
// holding .boardown/ — rejecting absolute paths and any '..' escape. The shape
// mirrors board-fs's guard, but the root is one level up and there is no write
// counterpart: this path is read-only by construction.
// Exported for unit tests, like its board-scoped sibling.
export function resolveProjectTarget(projectRoot: string, userPath: string): string | null {
  const normalized = userPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  const abs = path.resolve(projectRoot, normalized);
  const rel = path.relative(projectRoot, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return abs;
}

export async function readProjectFile(
  projectRoot: string,
  userPath: string,
): Promise<ProjectFileRead> {
  const target = resolveProjectTarget(projectRoot, userPath);
  if (target === null) return { kind: 'unreadable' };

  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) return { kind: 'unreadable' };
    if (stat.size > PROJECT_FILE_MAX_BYTES) return { kind: 'too-large' };
    return classifyProjectFile(await fsp.readFile(target));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { kind: code === 'ENOENT' || code === 'ENOTDIR' ? 'not-found' : 'unreadable' };
  }
}
