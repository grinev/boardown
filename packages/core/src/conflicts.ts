import type { FsAdapter } from './fs-adapter.js';
import type { ParseProblem } from './problems.js';

export class ConflictError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`File changed on disk since it was loaded: ${path}`);
    this.name = 'ConflictError';
    this.path = path;
  }
}

// A block the parser could not read never enters the loaded model, so writing
// the file back would drop it. The guard refuses instead, and carries the
// problems that justify the refusal so a shell can show them.
export class UnreadableFileError extends Error {
  readonly path: string;
  readonly problems: readonly ParseProblem[];
  constructor(path: string, problems: readonly ParseProblem[]) {
    super(`Refusing to write ${path}: it holds a block boardown could not read`);
    this.name = 'UnreadableFileError';
    this.path = path;
    this.problems = problems;
  }
}

export interface GuardedFile {
  path: string;
  content: string;
}

// An FsAdapter plus the multi-target operations. Shells keep implementing the
// plain FsAdapter; these live on the guard, which is the only thing that owns
// the version map.
export interface GuardedFs extends FsAdapter {
  // Writes files that must land together (e.g. a link mirrored into two tasks):
  // every target is checked before any of them is written, so an external change
  // aborts the whole operation instead of half-applying it.
  writeAll(files: readonly GuardedFile[]): Promise<void>;
  // Writes `content` at `to` and removes `from` — a file that changes its name,
  // e.g. a renamed release. Both ends are checked first: a source changed on disk
  // and anything at all sitting at the target abort before a byte is written.
  moveFile(from: string, to: string, content: string): Promise<void>;
  // Removes a directory, which has no recorded version of its own, after
  // confirming it is still empty on disk. Anything that appeared in it since the
  // load is an external change, so this refuses rather than deleting it too.
  removeDir(path: string): Promise<void>;
}

export interface GuardOptions {
  // Owned by the caller and mutated in place as writes succeed; reload re-seeds
  // it with a fresh guard.
  versions: Record<string, number>;
  // The problems the load reported, used to refuse a write that would lose a
  // block the parser could not read.
  problems: readonly ParseProblem[];
  onConflict: (path: string) => void;
  onUnreadable: (path: string, problems: readonly ParseProblem[]) => void;
}

// Wraps an FsAdapter so that every write is refused when it would lose data.
// Two rules, in this order: the target must be one the parser fully understood,
// and its lastModified must still match the version recorded at load time — a
// mismatch (edited externally, git pull, another window) means writing would
// clobber that change. Either refusal calls its callback and throws.
export function createGuardedFs(inner: FsAdapter, options: GuardOptions): GuardedFs {
  const { versions, problems, onConflict, onUnreadable } = options;

  // Deletion is deliberate and total, so only the write paths use this: what it
  // guards against is a silent partial loss, not a removal the user asked for.
  const checkReadable = (path: string): void => {
    const matching = problems.filter((p) => p.file === path && p.level === 'error');
    if (matching.length === 0) return;
    onUnreadable(path, matching);
    throw new UnreadableFileError(path, matching);
  };

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

  const drop = async (path: string): Promise<void> => {
    await inner.remove(path);
    delete versions[path];
  };

  return {
    read: (path) => inner.read(path),
    list: (dir) => inner.list(dir),
    stat: (path) => inner.stat(path),
    mkdir: (dir) => inner.mkdir(dir),

    async write(path, content) {
      checkReadable(path);
      await check(path);
      await put(path, content);
    },

    async writeAll(files) {
      for (const file of files) checkReadable(file.path);
      for (const file of files) await check(file.path);
      for (const file of files) await put(file.path, file.content);
    },

    async moveFile(from, to, content) {
      // The content being moved was parsed from `from`, so that is the path a
      // lost block would have come from.
      checkReadable(from);
      await check(from);
      // Unlike a write, the target must not exist at all: the caller picked this
      // path for a file that is not there, so anything sitting on it is a state
      // we never loaded and must not overwrite.
      if ((await inner.stat(to)) !== null) {
        onConflict(to);
        throw new ConflictError(to);
      }

      await put(to, content);
      try {
        await drop(from);
      } catch (err) {
        // No shell has an atomic rename, so the copy has already landed. Leaving
        // both would duplicate the release on disk — worse than either outcome
        // the guard promises — so undo the copy and report the original failure.
        try {
          await drop(to);
        } catch {
          throw new Error(
            `Renamed ${from} to ${to} but could not remove either one; clean up by hand`,
          );
        }
        throw err;
      }
    },

    async remove(path) {
      await check(path);
      await drop(path);
    },

    async removeDir(path) {
      const entries = await inner.list(path);
      if (entries.length > 0) {
        onConflict(path);
        throw new ConflictError(path);
      }
      await inner.remove(path);
    },
  };
}
