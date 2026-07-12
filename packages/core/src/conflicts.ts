import type { FsAdapter } from './fs-adapter.js';

export class ConflictError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`File changed on disk since it was loaded: ${path}`);
    this.name = 'ConflictError';
    this.path = path;
  }
}

export interface GuardedFile {
  path: string;
  content: string;
}

// An FsAdapter plus a multi-file write. Shells keep implementing the three-method
// FsAdapter; writeAll lives on the guard, which is the only thing that owns the
// version map.
export interface GuardedFs extends FsAdapter {
  // Writes files that must land together (e.g. a link mirrored into two tasks):
  // every target is checked before any of them is written, so an external change
  // aborts the whole operation instead of half-applying it.
  writeAll(files: readonly GuardedFile[]): Promise<void>;
}

// Wraps an FsAdapter so that every write first checks the target's lastModified
// against the version recorded at load time. A mismatch (edited externally, git
// pull, another window) means writing would clobber that change, so it calls
// onConflict and throws instead. `versions` is owned by the caller and mutated
// in place as writes succeed; reload re-seeds it with a fresh guard.
export function createGuardedFs(
  inner: FsAdapter,
  versions: Record<string, number>,
  onConflict: (path: string) => void,
): GuardedFs {
  const check = async (path: string): Promise<void> => {
    const current = await inner.stat(path);
    if (current === null) return;
    const known = versions[path];
    // Known file whose mtime moved, or a file that appeared on disk without us
    // ever loading it — both mean the on-disk state is not what we expect.
    if (known === undefined || current.lastModified !== known) {
      onConflict(path);
      throw new ConflictError(path);
    }
  };

  const put = async (path: string, content: string): Promise<void> => {
    await inner.write(path, content);
    const after = await inner.stat(path);
    if (after !== null) {
      versions[path] = after.lastModified;
    }
  };

  return {
    read: (path) => inner.read(path),
    list: (dir) => inner.list(dir),
    stat: (path) => inner.stat(path),

    async write(path, content) {
      await check(path);
      await put(path, content);
    },

    async writeAll(files) {
      for (const file of files) await check(file.path);
      for (const file of files) await put(file.path, file.content);
    },
  };
}
