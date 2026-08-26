import {
  createGuardedFs,
  emptyBacklog,
  type FileStat,
  type FsAdapter,
  type FsEntry,
  type GuardedFs,
  type ParseProblem,
} from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { CliError } from './output';
import { writeContainer, writeContainers, type ContainerRef } from './persistence';

class InMemoryFs implements FsAdapter {
  files = new Map<string, string>();
  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async list(): Promise<FsEntry[]> {
    return [];
  }
  async stat(): Promise<FileStat | null> {
    return null;
  }
  async mkdir(): Promise<void> {}
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}

// The same wiring loadBoardOrThrow builds, minus the board: the refusal the CLI
// shows for an unreadable file is the guard's, mapped onto a CliError.
const guard = (inner: FsAdapter, problems: ParseProblem[]): GuardedFs =>
  createGuardedFs(inner, {
    versions: {},
    problems,
    onConflict: () => {
      throw new CliError('CONFLICT', 'unexpected conflict');
    },
    onUnreadable: (path, matching) => {
      throw new CliError('UNREADABLE_FRONTMATTER', `Refusing to write ${path}`, 1, [...matching]);
    },
  });

const backlogRef = (): ContainerRef => ({ kind: 'backlog', container: emptyBacklog() });

const errorOn = (file: string): ParseProblem => ({
  level: 'error',
  scope: 'task',
  file,
  taskIndex: 0,
  message: 'Invalid task frontmatter YAML: bad indentation',
});

describe('writeContainer', () => {
  it('writes normally when there are no problems for the file', async () => {
    const inner = new InMemoryFs();
    const ref = backlogRef();
    await writeContainer(guard(inner, []), ref);
    expect(inner.files.has(ref.container.filename)).toBe(true);
  });

  it('writes normally when problems exist for a different file', async () => {
    const inner = new InMemoryFs();
    const ref = backlogRef();
    await writeContainer(guard(inner, [errorOn('releases/other.md')]), ref);
    expect(inner.files.has(ref.container.filename)).toBe(true);
  });

  it('refuses to write a file with an unresolved task-level parse error', async () => {
    const inner = new InMemoryFs();
    const ref = backlogRef();
    const fs = guard(inner, [errorOn(ref.container.filename)]);

    await expect(writeContainer(fs, ref)).rejects.toMatchObject({
      code: 'UNREADABLE_FRONTMATTER',
    });
    expect(inner.files.has(ref.container.filename)).toBe(false);
  });

  it('does not refuse on a warning-level problem for the same file', async () => {
    const inner = new InMemoryFs();
    const ref = backlogRef();
    const problems: ParseProblem[] = [
      { level: 'warning', scope: 'file', file: ref.container.filename, message: 'heads up' },
    ];
    await writeContainer(guard(inner, problems), ref);
    expect(inner.files.has(ref.container.filename)).toBe(true);
  });

  it('carries the matching problems on the thrown error', async () => {
    const inner = new InMemoryFs();
    const ref = backlogRef();
    const problem = errorOn(ref.container.filename);

    try {
      await writeContainer(guard(inner, [problem]), ref);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).problems).toEqual([problem]);
    }
  });
});

describe('writeContainers', () => {
  it('refuses the whole batch if any target has an unresolved parse error, writing nothing', async () => {
    const inner = new InMemoryFs();
    const ok = backlogRef();
    const broken: ContainerRef = {
      kind: 'backlog',
      container: { ...emptyBacklog(), filename: 'broken.md' },
    };
    const fs = guard(inner, [errorOn(broken.container.filename)]);

    await expect(writeContainers(fs, [ok, broken])).rejects.toMatchObject({
      code: 'UNREADABLE_FRONTMATTER',
    });
    expect(inner.files.size).toBe(0);
  });
});
