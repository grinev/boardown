import { promises as fsp } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path';
import type { FileStat, FsAdapter, FsEntry } from '@boardown/core';

// Join a board-relative path onto the board root, rejecting absolute paths and
// any '..' escape — mirrors packages/electron's board-fs guard so a caller can
// never reach outside the board's `.boardown/` directory.
export function resolveTarget(boardRoot: string, userPath: string): string | null {
  if (isAbsolute(userPath)) return null;
  const normalized = normalize(userPath);
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) return null;
  const root = resolve(boardRoot);
  const target = resolve(root, normalized);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const isENOENT = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';

// FsAdapter backed by Node's filesystem, rooted at a board's `.boardown/`
// directory.
export class NodeFsAdapter implements FsAdapter {
  constructor(private readonly boardRoot: string) {}

  read(path: string): Promise<string> {
    return fsp.readFile(this.target(path), 'utf8');
  }

  async write(path: string, content: string): Promise<void> {
    const target = this.target(path);
    await fsp.mkdir(dirname(target), { recursive: true });
    await fsp.writeFile(target, content, 'utf8');
  }

  async list(dir: string): Promise<FsEntry[]> {
    try {
      const entries = await fsp.readdir(this.target(dir), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    } catch (err) {
      if (isENOENT(err)) return [];
      throw err;
    }
  }

  async mkdir(dir: string): Promise<void> {
    await fsp.mkdir(this.target(dir), { recursive: true });
  }

  async remove(path: string): Promise<void> {
    await fsp.rm(this.target(path), { recursive: true, force: true });
  }

  async stat(path: string): Promise<FileStat | null> {
    try {
      const stats = await fsp.stat(this.target(path));
      return { lastModified: stats.mtimeMs };
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  private target(path: string): string {
    const resolved = resolveTarget(this.boardRoot, path);
    if (resolved === null) {
      throw new Error(`Path "${path}" escapes the board root`);
    }
    return resolved;
  }
}
