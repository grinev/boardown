import type { FsAdapter, FsEntry } from './fs-adapter.js';
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
  content: string | Uint8Array;
}

// One file of a set that lands together. A create-only target must not exist at
// all — the caller picked the path for a file that is not there.
export interface GuardedWrite extends GuardedFile {
  createOnly?: boolean;
}

// A set of writes and removals that land together or not at all. The removals are
// rewrites — a renamed file's old path, a file whose content moved elsewhere — so
// unlike a deliberate `remove` they are held to the unreadable rule too.
export interface GuardedChange {
  writes: readonly GuardedWrite[];
  removes: readonly string[];
  // Things the loader never read, so there is no version to check them against —
  // a task's attachments. Removed as they stand on disk, a folder with everything
  // in it, after every other step. Only for a deletion the user confirmed with its
  // contents named; never a way around a conflict.
  unversionedRemoves?: readonly string[];
  // Checked like a write target but not written: the file an operation's decision
  // was read from when the operation lands elsewhere (a task's release, when only
  // its attachments change).
  unchanged?: readonly string[];
}

// An FsAdapter plus the multi-target operations. Shells keep implementing the
// plain FsAdapter; these live on the guard, which is the only thing that owns
// the version map.
export interface GuardedFs extends FsAdapter {
  // Every target is checked before a byte moves; writes land before removals, and a
  // step failing part-way undoes the steps already taken, so a set of files is
  // never left half-applied. `writeAll` and `moveFile` are its narrow forms.
  commit(change: GuardedChange): Promise<void>;
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
    const known = versions[path];
    if (current === null && known === undefined) return;
    // Known file whose mtime moved, a known file deleted since we loaded it, or a
    // file that appeared on disk without us ever loading it — each means the
    // on-disk state is not what we expect.
    if (current === null || known === undefined || current.lastModified !== known) {
      onConflict(path);
      throw new ConflictError(path);
    }
  };

  const put = async (path: string, content: string | Uint8Array): Promise<void> => {
    if (typeof content === 'string') await inner.write(path, content);
    else await inner.writeBytes(path, content);
    const after = await inner.stat(path);
    if (after !== null) {
      versions[path] = after.lastModified;
    }
  };

  const drop = async (path: string): Promise<void> => {
    await inner.remove(path);
    delete versions[path];
  };

  // What a path held before the commit touched it, so a failed step can put it back.
  // Bytes rather than text, so the undo is exact for every kind of file.
  const previous = async (path: string): Promise<Uint8Array | null> =>
    (await inner.stat(path)) === null ? null : inner.readBytes(path);

  // `stat` does not tell a folder from a file; the parent's listing does.
  const entryOf = async (path: string): Promise<FsEntry | null> => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const entries = await inner.list(slash === -1 ? '' : path.slice(0, slash));
    return entries.find((e) => e.name === name) ?? null;
  };

  const filesBeneath = async (dir: string): Promise<string[]> => {
    const files: string[] = [];
    for (const entry of await inner.list(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) files.push(...(await filesBeneath(path)));
      else files.push(path);
    }
    return files;
  };

  const commit = async (change: GuardedChange): Promise<void> => {
    for (const file of change.writes) checkReadable(file.path);
    for (const path of change.removes) checkReadable(path);
    for (const file of change.writes) {
      if (file.createOnly && (await inner.stat(file.path)) !== null) {
        onConflict(file.path);
        throw new ConflictError(file.path);
      }
      await check(file.path);
    }
    for (const path of change.removes) await check(path);
    for (const path of change.unchanged ?? []) await check(path);

    const touched: { path: string; before: Uint8Array | null }[] = [];
    try {
      for (const file of change.writes) {
        const before = await previous(file.path);
        await put(file.path, file.content);
        touched.push({ path: file.path, before });
      }
      for (const path of change.removes) {
        const before = await previous(path);
        await drop(path);
        touched.push({ path, before });
      }
      for (const path of change.unversionedRemoves ?? []) {
        const entry = await entryOf(path);
        if (entry === null) continue;
        // A folder is taken file by file, each one's bytes kept, so a failure
        // part-way can still put back what was already gone.
        for (const file of entry.isDirectory ? await filesBeneath(path) : [path]) {
          const before = await inner.readBytes(file);
          await drop(file);
          touched.push({ path: file, before });
        }
        if (entry.isDirectory) await inner.remove(path);
      }
    } catch (err) {
      // No shell has atomic multi-file I/O, so the steps that landed are undone in
      // reverse. Leaving them would half-apply the change — a moved task in two
      // files, or in none — which is worse than either outcome the guard promises.
      try {
        for (const step of touched.reverse()) {
          if (step.before === null) {
            if ((await inner.stat(step.path)) !== null) await drop(step.path);
          } else {
            await put(step.path, step.before);
          }
        }
      } catch {
        throw new Error(
          `A multi-file write failed part-way and could not be undone (${touched
            .map((t) => t.path)
            .join(', ')}); clean up by hand`,
        );
      }
      throw err;
    }
  };

  return {
    read: (path) => inner.read(path),
    readBytes: (path) => inner.readBytes(path),
    list: (dir) => inner.list(dir),
    stat: (path) => inner.stat(path),
    mkdir: (dir) => inner.mkdir(dir),

    async write(path, content) {
      checkReadable(path);
      await check(path);
      await put(path, content);
    },

    async writeBytes(path, content) {
      checkReadable(path);
      await check(path);
      await put(path, content);
    },

    commit,

    writeAll: (files) => commit({ writes: files, removes: [] }),

    // The content being moved was parsed from `from`, so the unreadable rule applies
    // to the removal of the source; anything sitting at the target refuses it.
    moveFile: (from, to, content) =>
      commit({ writes: [{ path: to, content, createOnly: true }], removes: [from] }),

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
