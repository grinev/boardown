import {
  createGuardedFs,
  emptyBacklog,
  type FileStat,
  type FsAdapter,
  type FsEntry,
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

const backlogRef = (): ContainerRef => ({ kind: 'backlog', container: emptyBacklog() });

describe('writeContainer', () => {
  it('writes normally when there are no problems for the file', async () => {
    const fs = new InMemoryFs();
    const ref = backlogRef();
    await writeContainer(fs, ref, []);
    expect(fs.files.has(ref.container.filename)).toBe(true);
  });

  it('writes normally when problems exist for a different file', async () => {
    const fs = new InMemoryFs();
    const ref = backlogRef();
    const problems: ParseProblem[] = [
      { level: 'error', scope: 'task', file: 'releases/other.md', taskIndex: 0, message: 'bad' },
    ];
    await writeContainer(fs, ref, problems);
    expect(fs.files.has(ref.container.filename)).toBe(true);
  });

  it('refuses to write a file with an unresolved task-level parse error', async () => {
    const fs = new InMemoryFs();
    const ref = backlogRef();
    const problems: ParseProblem[] = [
      {
        level: 'error',
        scope: 'task',
        file: ref.container.filename,
        taskIndex: 1,
        message: 'Invalid task frontmatter YAML: bad indentation',
      },
    ];

    await expect(writeContainer(fs, ref, problems)).rejects.toMatchObject({
      code: 'UNREADABLE_FRONTMATTER',
    });
    expect(fs.files.has(ref.container.filename)).toBe(false);
  });

  it('does not refuse on a warning-level problem for the same file', async () => {
    const fs = new InMemoryFs();
    const ref = backlogRef();
    const problems: ParseProblem[] = [
      { level: 'warning', scope: 'file', file: ref.container.filename, message: 'heads up' },
    ];
    await writeContainer(fs, ref, problems);
    expect(fs.files.has(ref.container.filename)).toBe(true);
  });

  it('carries the matching problems on the thrown error', async () => {
    const fs = new InMemoryFs();
    const ref = backlogRef();
    const problem: ParseProblem = {
      level: 'error',
      scope: 'task',
      file: ref.container.filename,
      taskIndex: 0,
      message: 'broken',
    };

    try {
      await writeContainer(fs, ref, [problem]);
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
    const fs = createGuardedFs(inner, {}, () => {
      throw new Error('unexpected conflict');
    });
    const ok = backlogRef();
    const broken: ContainerRef = {
      kind: 'backlog',
      container: { ...emptyBacklog(), filename: 'broken.md' },
    };
    const problems: ParseProblem[] = [
      { level: 'error', scope: 'task', file: broken.container.filename, taskIndex: 0, message: 'bad' },
    ];

    await expect(writeContainers(fs, [ok, broken], problems)).rejects.toMatchObject({
      code: 'UNREADABLE_FRONTMATTER',
    });
    expect(inner.files.size).toBe(0);
  });
});
