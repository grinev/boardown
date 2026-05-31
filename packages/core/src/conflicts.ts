import type { FsAdapter } from './fs-adapter.js';

export class ConflictError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`File changed on disk since it was loaded: ${path}`);
    this.name = 'ConflictError';
    this.path = path;
  }
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
): FsAdapter {
  return {
    read: (path) => inner.read(path),
    list: (dir) => inner.list(dir),
    stat: (path) => inner.stat(path),

    async write(path, content) {
      const current = await inner.stat(path);
      if (current !== null) {
        const known = versions[path];
        // Known file whose mtime moved, or a file that appeared on disk without
        // us ever loading it — both mean the on-disk state is not what we expect.
        if (known === undefined || current.lastModified !== known) {
          onConflict(path);
          throw new ConflictError(path);
        }
      }
      await inner.write(path, content);
      const after = await inner.stat(path);
      if (after !== null) {
        versions[path] = after.lastModified;
      }
    },
  };
}
