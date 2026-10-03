import type {
  Backlog,
  BoardConfig,
  BoardSnapshot,
  Epic,
  FileStat,
  FsEntry,
  GuardedChange,
  GuardedFile,
  GuardedFs,
  Release,
  ReleaseStatus,
  Task,
} from '@boardown/core';
import type { ParseProblem } from '@boardown/core';
import {
  APP_VERSION,
  BACKLOG_PATH,
  CONFIG_FILENAME,
  MIN_COMPATIBLE_VERSION,
  createGuardedFs,
  emptyDocsTree,
} from '@boardown/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAnyDialogOpen, useBoardStore } from './store';

// In-memory adapter mirroring packages/core's reference impl, plus a switch to
// simulate write failures so we can assert optimistic-update rollback.
class MemFs implements GuardedFs {
  files = new Map<string, { content: string | Uint8Array; lastModified: number }>();
  dirs = new Set<string>();
  writes: string[] = [];
  writeAllCalls: string[][] = [];
  removes: string[] = [];
  // When set, any write whose path includes this substring throws.
  failWritesMatching: string | null = null;

  async writeAll(files: readonly GuardedFile[]): Promise<void> {
    this.writeAllCalls.push(files.map((file) => file.path));
    for (const file of files) {
      if (typeof file.content === 'string') await this.write(file.path, file.content);
      else await this.writeBytes(file.path, file.content);
    }
  }

  async commit(change: GuardedChange): Promise<void> {
    await this.writeAll(change.writes);
    for (const path of change.removes) await this.remove(path);
    for (const path of change.unversionedRemoves ?? []) await this.remove(path);
  }

  async removeDir(path: string): Promise<void> {
    await this.remove(path);
  }

  async moveFile(from: string, to: string, content: string): Promise<void> {
    await this.write(to, content);
    await this.remove(from);
  }

  async mkdir(dir: string): Promise<void> {
    this.dirs.add(dir);
    this.writes.push(dir);
  }

  async remove(path: string): Promise<void> {
    if (this.failWritesMatching !== null &&
      (this.failWritesMatching === '*' || path.includes(this.failWritesMatching))) {
      throw new Error('disk full');
    }
    this.files.delete(path);
    this.dirs.delete(path);
    const prefix = `${path}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key);
    for (const d of [...this.dirs]) if (d.startsWith(prefix)) this.dirs.delete(d);
    this.removes.push(path);
  }

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof entry.content === 'string' ? entry.content : new TextDecoder().decode(entry.content);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof entry.content === 'string' ? new TextEncoder().encode(entry.content) : entry.content;
  }

  async write(path: string, content: string): Promise<void> {
    await this.writeBytesOrText(path, content);
  }

  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    await this.writeBytesOrText(path, content);
  }

  private async writeBytesOrText(path: string, content: string | Uint8Array): Promise<void> {
    if (
      this.failWritesMatching !== null &&
      (this.failWritesMatching === '*' || path.includes(this.failWritesMatching))
    ) {
      throw new Error('disk full');
    }
    this.files.set(path, { content, lastModified: Date.now() });
    this.writes.push(path);
  }

  async list(dir: string): Promise<FsEntry[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out = new Map<string, boolean>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tail = key.slice(prefix.length);
      const slash = tail.indexOf('/');
      if (slash === -1) out.set(tail, false);
      else out.set(tail.slice(0, slash), true);
    }
    for (const d of this.dirs) {
      if (!d.startsWith(prefix)) continue;
      const tail = d.slice(prefix.length);
      const slash = tail.indexOf('/');
      out.set(slash === -1 ? tail : tail.slice(0, slash), true);
    }
    return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    if (entry === undefined) return null;
    const size =
      typeof entry.content === 'string' ? entry.content.length : entry.content.byteLength;
    return { lastModified: entry.lastModified, size };
  }
}

const config = (): BoardConfig => ({
  idPrefix: 'BD',
  nextId: 10,
  projectName: 'My Project',
});

const task = (id: string, over: Partial<Task['frontmatter']> = {}): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 100, ...over },
});

const release = (
  slug: string,
  status: ReleaseStatus,
  tasks: Task[] = [],
): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status, name: slug },
  preamble: '',
  tasks,
});

const epic = (slug: string): Epic => ({
  filename: `epics/${slug}.md`,
  slug,
  frontmatter: { name: slug, color: '#1f6feb' },
  preamble: '',
});

const backlog = (tasks: Task[] = []): Backlog => ({
  filename: BACKLOG_PATH,
  frontmatter: {},
  preamble: '',
  tasks,
});

const snap = (over: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  config: config(),
  releases: [],
  epics: [],
  backlog: null,
  heldBack: [],
  docs: emptyDocsTree(),
  problems: [],
  ...over,
});

const setup = (snapshot: BoardSnapshot): { fs: MemFs } => {
  const fs = new MemFs();
  useBoardStore.setState({
    status: 'ready',
    snapshot,
    problems: [],
    errorMessage: null,
    fs,
    theme: snapshot.config.theme ?? 'light',
    selectedTaskId: null,
    selectedEpicSlug: null,
    selectedReleaseFilename: null,
    docPopupPath: null,
    repoFilePopupPath: null,
    unwritableFile: null,
    selectedDocPath: null,
    dialogStack: [],
  });
  return { fs };
};

const state = () => useBoardStore.getState();
const current = () => state().snapshot!;

beforeEach(() => {
  useBoardStore.setState({ errorMessage: null });
});

describe('deleteTask', () => {
  const linked = (id: string, ...to: string[]): Task => ({
    ...task(id),
    frontmatter: {
      ...task(id).frontmatter,
      links: to.map((t) => ({ type: 'relates' as const, to: t })),
    },
  });

  it('removes the task, writes its file and clears the selection', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current', [task('BD-1'), task('BD-2')])] }),
    );
    useBoardStore.setState({ selectedTaskId: 'BD-1' });

    await state().deleteTask('BD-1');

    expect(current().releases[0]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-2']);
    expect(state().selectedTaskId).toBeNull();
    expect(fs.writes).toEqual(['releases/1.0.md']);
  });

  it('strips the mirrored link from the other task and writes both files', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [linked('BD-1', 'BD-2')])],
        backlog: backlog([linked('BD-2', 'BD-1')]),
      }),
    );

    await state().deleteTask('BD-1');

    expect(current().backlog!.tasks[0]!.frontmatter.links).toBeUndefined();
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('strips the mirrored link from an archived counterpart', async () => {
    const { fs } = setup(
      snap({
        releases: [
          release('0.9', 'finished', [linked('BD-2', 'BD-1')]),
          release('1.0', 'current', [linked('BD-1', 'BD-2')]),
        ],
      }),
    );

    await state().deleteTask('BD-1');

    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toBeUndefined();
    expect(fs.writes.sort()).toEqual(['releases/0.9.md', 'releases/1.0.md'].sort());
  });

  it("removes the task's attachments folder with it, whatever it holds", async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current', [task('BD-1')])] }));
    await fs.writeBytes('attachments/BD-1/a.png', new Uint8Array([0, 1]));
    await fs.writeBytes('attachments/BD-1/sub/b.txt', new Uint8Array([2]));
    await fs.writeBytes('attachments/BD-2/c.txt', new Uint8Array([3]));

    await state().deleteTask('BD-1');

    expect([...fs.files.keys()].filter((k) => k.startsWith('attachments/'))).toEqual([
      'attachments/BD-2/c.txt',
    ]);
  });

  it('refuses a task in a finished release', async () => {
    setup(snap({ releases: [release('0.9', 'finished', [task('BD-1')])] }));

    await expect(state().deleteTask('BD-1')).rejects.toThrow(/finished release/);
    expect(current().releases[0]!.tasks).toHaveLength(1);
  });

  it('keeps the task and the open dialog when the write fails', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current', [task('BD-1')])] }),
    );
    useBoardStore.setState({ selectedTaskId: 'BD-1' });
    fs.failWritesMatching = '*';

    await expect(state().deleteTask('BD-1')).rejects.toThrow();

    expect(current().releases[0]!.tasks).toHaveLength(1);
    expect(state().selectedTaskId).toBe('BD-1');
    expect(state().errorMessage).toMatch(/Failed to delete task/);
  });
});

describe('createTask', () => {
  it('starts over when a refresh lands while the folder is being read', async () => {
    const { fs: stale } = setup(snap({ releases: [release('1.0', 'current'), release('2.0', 'future')] }));
    const fresh = new MemFs();
    const refreshed = snap({
      releases: [release('1.0', 'current'), release('2.0', 'future', [task('BD-3')])],
    });
    const list = stale.list.bind(stale);
    stale.list = async (dir: string) => {
      useBoardStore.setState({ snapshot: refreshed, fs: fresh });
      return list(dir);
    };

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'With a file',
      type: 'feature',
      attachments: [{ name: 'a.txt', content: new Uint8Array([1]) }],
    });

    expect(current().releases[1]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-3']);
    expect(current().releases[0]!.tasks).toHaveLength(1);
    expect(fresh.files.has('attachments/BD-10/a.txt')).toBe(true);
    expect(stale.writes).toEqual([]);
  });

  it("writes picked files into the new task's folder with the task, suffixing a taken name", async () => {
    const { fs } = setup(snap({ config: config(), releases: [release('1.0', 'current')] }));
    const id = `BD-${current().config.nextId}`;
    await fs.writeBytes(`attachments/${id}/shot.png`, new Uint8Array([9]));

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'With files',
      type: 'feature',
      attachments: [
        { name: 'shot.png', content: new Uint8Array([0, 255]) },
        { name: 'notes.txt', content: new Uint8Array([1]) },
      ],
    });

    expect(await fs.readBytes(`attachments/${id}/shot (1).png`)).toEqual(new Uint8Array([0, 255]));
    expect(await fs.readBytes(`attachments/${id}/notes.txt`)).toEqual(new Uint8Array([1]));
    expect(await fs.readBytes(`attachments/${id}/shot.png`)).toEqual(new Uint8Array([9]));
    expect(current().releases[0]!.tasks[0]!.frontmatter.id).toBe(id);
  });

  it('adds a task to a release and bumps nextId in config', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'New',
      type: 'feature',
    });

    const tasks = current().releases[0]!.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe('New');
    expect(current().config.nextId).toBe(11);
    expect(fs.files.has('releases/1.0.md')).toBe(true);
    expect(fs.files.has(CONFIG_FILENAME)).toBe(true);
  });

  it('writes no priority key when the input carries none', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'New',
      type: 'feature',
    });

    expect(current().releases[0]!.tasks[0]!.frontmatter.priority).toBeUndefined();
    expect(fs.files.get('releases/1.0.md')?.content).not.toContain('priority:');
  });

  it('writes the priority the input carries', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'New',
      type: 'feature',
      priority: 'critical',
    });

    expect(current().releases[0]!.tasks[0]!.frontmatter.priority).toBe('critical');
    expect(fs.files.get('releases/1.0.md')?.content).toContain('priority: critical');
  });

  it('creates a release-less task in the backlog, naming its epic in its own key', async () => {
    const { fs } = setup(snap({ epics: [epic('parser')], backlog: backlog([task('BD-1')]) }));

    await state().createTask({ title: 'In epic', type: 'tech', epic: 'parser' });

    const tasks = current().backlog!.tasks;
    expect(tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-10']);
    expect(tasks[1]!.frontmatter.epic).toBe('parser');
    expect(fs.files.get(BACKLOG_PATH)!.content).toMatch(/^epic: parser$/m);
    expect(fs.files.has('epics/parser.md')).toBe(false);
  });

  it('stores the epic in frontmatter when the task goes into a release', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current')], epics: [epic('parser')] }),
    );

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'Scheduled',
      type: 'feature',
      epic: 'parser',
    });

    // A release file mixes epics, so there the `epic` key is the only link.
    expect(fs.files.get('releases/1.0.md')!.content).toMatch(/^epic: parser$/m);
  });

  it('lazily creates backlog.md for an epic-less, release-less task', async () => {
    const { fs } = setup(snap({ backlog: null }));

    await state().createTask({ title: 'Loose', type: 'bug' });

    expect(current().backlog).not.toBeNull();
    expect(current().backlog!.tasks).toHaveLength(1);
    expect(fs.files.has(BACKLOG_PATH)).toBe(true);
  });

  it('writes the new task, every linked file and the config in one set', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );

    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'Linked',
      type: 'feature',
      links: [
        { type: 'blocks', to: 'BD-2' },
        { type: 'relates', to: 'BD-1' },
      ],
    });

    const created = current().releases[0]!.tasks[1]!;
    expect(created.frontmatter.links).toEqual([
      { type: 'blocks', to: 'BD-2' },
      { type: 'relates', to: 'BD-1' },
    ]);
    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-10' },
    ]);
    expect(current().backlog!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'blocked-by', to: 'BD-10' },
    ]);
    expect(fs.writeAllCalls).toEqual([['releases/1.0.md', BACKLOG_PATH, CONFIG_FILENAME]]);
  });

  it('leaves a missing backlog missing when the task goes into a release', async () => {
    setup(snap({ releases: [release('1.0', 'current')], backlog: null }));

    await state().createTask({ releaseFilename: 'releases/1.0.md', title: 'New', type: 'feature' });

    expect(current().backlog).toBeNull();
  });

  it('opens the create dialog bound to an epic and clears it on close', () => {
    setup(snap({ epics: [epic('parser')] }));

    state().openEpic('parser');
    state().openCreateTaskForEpic('parser');
    expect(state().createTaskForEpicSlug).toBe('parser');
    // The create dialog stacks over the epic dialog rather than replacing it.
    expect(state().selectedEpicSlug).toBe('parser');

    state().closeCreateTask();
    expect(state().createTaskForEpicSlug).toBeNull();
  });
});

describe('updateTask', () => {
  it('edits a field in place without relocating', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current', [task('BD-1')])] }),
    );

    await state().updateTask('BD-1', { title: 'Renamed' });

    expect(current().releases[0]!.tasks[0]!.title).toBe('Renamed');
    expect(fs.writes).toContain('releases/1.0.md');
  });

  it('writes a custom field value flat into the task frontmatter', async () => {
    const { fs } = setup(
      snap({
        config: { ...config(), customFields: [{ key: 'env', type: 'string' }] },
        releases: [release('1.0', 'current', [task('BD-1')])],
      }),
    );

    await state().updateTask('BD-1', { custom: { env: 'staging' } });

    expect(current().releases[0]!.tasks[0]!.frontmatter.custom).toEqual({ env: 'staging' });
    expect(fs.files.get('releases/1.0.md')?.content).toContain('env: staging');
  });

  it('removes the key when a custom field value is cleared', async () => {
    const { fs } = setup(
      snap({
        config: { ...config(), customFields: [{ key: 'env', type: 'string' }] },
        releases: [
          release('1.0', 'current', [task('BD-1', { custom: { env: 'staging' } })]),
        ],
      }),
    );

    await state().updateTask('BD-1', { custom: { env: '' } });

    expect(current().releases[0]!.tasks[0]!.frontmatter.custom).toBeUndefined();
    expect(fs.files.get('releases/1.0.md')?.content).not.toContain('env:');
  });

  it('changes a backlog task\'s epic in place, the block staying where it is', async () => {
    const { fs } = setup(
      snap({ epics: [epic('parser')], backlog: backlog([task('BD-1'), task('BD-2')]) }),
    );

    await state().updateTask('BD-1', { epic: 'parser', priority: 'critical' });

    expect(current().backlog!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-2']);
    expect(current().backlog!.tasks[0]!.frontmatter).toMatchObject({
      epic: 'parser',
      priority: 'critical',
    });
    expect(fs.writes).toEqual([BACKLOG_PATH]);
  });

  it('clears a backlog task\'s epic in place', async () => {
    const { fs } = setup(snap({ backlog: backlog([task('BD-1', { epic: 'parser' })]) }));

    await state().updateTask('BD-1', { epic: null });

    expect(current().backlog!.tasks[0]!.frontmatter.epic).toBeUndefined();
    expect(fs.files.get(BACKLOG_PATH)!.content).not.toMatch(/^epic:/m);
  });
});

describe('editTaskLabels', () => {
  it('applies the edit to the labels on disk and writes the file alone when the registry has them', async () => {
    const { fs } = setup(
      snap({
        config: { ...config(), labels: ['ui', 'backend'] },
        // `backend` arrived from outside while the editor was open.
        backlog: backlog([task('BD-1', { labels: ['old', 'backend'] })]),
      }),
    );

    await state().editTaskLabels('BD-1', ['UI'], ['old']);

    expect(current().backlog!.tasks[0]!.frontmatter.labels).toEqual(['backend', 'ui']);
    expect(fs.writeAllCalls).toEqual([[BACKLOG_PATH]]);
  });

  it('appends a new label to the registry in the same write', async () => {
    const { fs } = setup(snap({ backlog: backlog([task('BD-1')]) }));

    await state().editTaskLabels('BD-1', ['fresh'], []);

    expect(current().config.labels).toEqual(['fresh']);
    expect(fs.writeAllCalls).toEqual([[BACKLOG_PATH, CONFIG_FILENAME]]);
    expect(fs.files.get(CONFIG_FILENAME)!.content).toContain('labels:\n  - fresh');
  });

  it('writes nothing when the edit changes nothing on disk', async () => {
    const { fs } = setup(snap({ backlog: backlog([task('BD-1', { labels: ['ui'] })]) }));

    await state().editTaskLabels('BD-1', ['UI'], ['gone']);

    expect(fs.writes).toEqual([]);
  });

  it('rolls both back when the write fails', async () => {
    const before = snap({ backlog: backlog([task('BD-1')]) });
    const { fs } = setup(before);
    fs.failWritesMatching = CONFIG_FILENAME;

    await expect(state().editTaskLabels('BD-1', ['fresh'], [])).rejects.toThrow();

    expect(current()).toBe(before);
    expect(state().errorMessage).toMatch(/Failed to save task/);
  });
});

describe('moveTaskToRelease', () => {
  it('moves a backlog task into a release, its epic kept', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current')],
        backlog: backlog([task('BD-1', { epic: 'parser' })]),
      }),
    );

    await state().moveTaskToRelease('BD-1', 'releases/1.0.md');

    expect(current().backlog!.tasks).toHaveLength(0);
    expect(current().releases[0]!.tasks[0]!.frontmatter).toMatchObject({
      id: 'BD-1',
      epic: 'parser',
    });
  });

  it('sends the task to the backlog, its epic kept even when it names no epic file', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1', { epic: 'gone' })])],
        epics: [epic('parser')],
      }),
    );

    await state().moveTaskToRelease('BD-1', null);

    expect(current().releases[0]!.tasks).toHaveLength(0);
    expect(current().backlog!.tasks[0]!.frontmatter.epic).toBe('gone');
    expect(fs.files.get(BACKLOG_PATH)!.content).toMatch(/^epic: gone$/m);
  });
});

describe('moveTaskOnBacklog', () => {
  it('reorders tasks within the flat backlog list', async () => {
    setup(
      snap({
        backlog: backlog([
          task('BD-1', { order: 100 }),
          task('BD-2', { order: 200 }),
        ]),
      }),
    );

    // Move BD-2 before BD-1.
    await state().moveTaskOnBacklog('BD-2', { kind: 'backlog' }, 'BD-1');

    const orderById = new Map(
      current().backlog!.tasks.map((t) => [
        t.frontmatter.id,
        t.frontmatter.order,
      ]),
    );
    expect(orderById.get('BD-2')!).toBeLessThan(orderById.get('BD-1')!);
  });

  it('moves an epic-less release task into the backlog', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2', { order: 100 })]),
      }),
    );

    await state().moveTaskOnBacklog('BD-1', { kind: 'backlog' }, null);

    expect(current().releases[0]!.tasks).toHaveLength(0);
    expect(current().backlog!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
    // Both ends of the move reach disk. The reorder only reports files whose
    // orders changed, and landing at the end of the list means BD-1 keeps the
    // order it was given — the destination must be written all the same.
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('lazily creates the backlog for an epic-less release task', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: null,
      }),
    );

    await state().moveTaskOnBacklog('BD-1', { kind: 'backlog' }, null);

    expect(current().releases[0]!.tasks).toHaveLength(0);
    expect(current().backlog!.filename).toBe(BACKLOG_PATH);
    expect(current().backlog!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
    expect(state().errorMessage).toBeNull();
    expect(fs.files.has(BACKLOG_PATH)).toBe(true);
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('keeps the epic of a release task dropped onto the backlog', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1', { epic: 'ui' })])],
        epics: [epic('ui')],
        backlog: backlog([task('BD-2', { order: 200 })]),
      }),
    );

    await state().moveTaskOnBacklog('BD-1', { kind: 'backlog' }, 'BD-2');

    const moved = current().backlog!.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.epic).toBe('ui');
    expect(moved.frontmatter.order).toBeLessThan(200);
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('leaves the task where it was when a write fails', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2', { order: 100 })]),
      }),
    );
    fs.failWritesMatching = '*';

    await expect(
      state().moveTaskOnBacklog('BD-1', { kind: 'backlog' }, null),
    ).rejects.toThrow();

    expect(current().releases[0]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
    expect(state().errorMessage).toMatch(/Failed to move task/);
  });
});

describe('release lifecycle', () => {
  it('starts a future release', async () => {
    const { fs } = setup(snap({ releases: [release('1.1', 'future')] }));

    await state().startRelease('releases/1.1.md');

    expect(current().releases[0]!.frontmatter.status).toBe('current');
    expect(fs.writes).toContain('releases/1.1.md');
  });

  it('reports an error for an unknown release filename', async () => {
    setup(snap({ releases: [release('1.1', 'future')] }));

    await state().startRelease('releases/nope.md');

    expect(state().errorMessage).toMatch(/not found/i);
  });

  it('completes the current release and relocates unfinished tasks to the backlog', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1', { status: 'todo' })])],
        backlog: backlog(),
      }),
    );

    await state().completeRelease('releases/1.0.md', { kind: 'backlog' });

    expect(current().releases[0]!.frontmatter.status).toBe('finished');
    expect(current().backlog!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('writes every container the redistribution touched, and nothing else', async () => {
    const { fs } = setup(
      snap({
        releases: [
          release('1.0', 'current', [
            task('BD-1', { status: 'todo', epic: 'ui' }),
            task('BD-2', { status: 'done', order: 200 }),
          ]),
          release('2.0', 'future'),
        ],
        epics: [epic('ui'), epic('core')],
        backlog: backlog(),
      }),
    );

    await state().completeRelease('releases/1.0.md', { kind: 'backlog' });

    // BD-1 goes to the backlog with its epic and BD-2 stays: no epic file and no
    // other release is rewritten.
    expect(current().backlog!.tasks[0]!.frontmatter.epic).toBe('ui');
    expect(fs.writes.sort()).toEqual([BACKLOG_PATH, 'releases/1.0.md'].sort());
  });

  it('reports an error for a release that is not on the board', async () => {
    setup(snap({ releases: [release('1.1', 'future')] }));

    await state().completeRelease('releases/nope.md', { kind: 'backlog' });

    expect(state().errorMessage).toMatch(/not found/i);
  });

  it('completes the release it was handed, not the first active one', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current'), release('2.0', 'current')],
        backlog: backlog(),
      }),
    );

    await state().completeRelease('releases/2.0.md', { kind: 'backlog' });

    expect(current().releases[0]!.frontmatter.status).toBe('current');
    expect(current().releases[1]!.frontmatter.status).toBe('finished');
    expect(fs.writes).toEqual(['releases/2.0.md']);
  });

  it('refuses a second start while the setting is off and allows it while on', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current'), release('2.0', 'future')],
      }),
    );

    await expect(state().startRelease('releases/2.0.md')).rejects.toThrow(/already active/);

    await state().setMultipleActiveReleases(true);
    await state().startRelease('releases/2.0.md');

    expect(current().releases[1]!.frontmatter.status).toBe('current');
  });
});

describe('updateRelease', () => {
  it('moves the file and re-points the open dialog when the name changes', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current', [task('BD-1')])] }),
    );
    await fs.write('releases/1.0.md', 'on disk');
    useBoardStore.setState({
      selectedReleaseFilename: 'releases/1.0.md',
      dialogStack: [{ kind: 'release', filename: 'releases/1.0.md' }],
    });

    await state().updateRelease('releases/1.0.md', { name: 'Beta 2' });

    const renamed = current().releases[0]!;
    expect(renamed.filename).toBe('releases/beta-2.md');
    expect(renamed.frontmatter.status).toBe('current');
    expect(renamed.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
    expect(fs.files.has('releases/1.0.md')).toBe(false);
    expect(fs.files.get('releases/beta-2.md')?.content).toMatch(/name: Beta 2/);
    expect(state().selectedReleaseFilename).toBe('releases/beta-2.md');
    expect(state().dialogStack).toEqual([
      { kind: 'release', filename: 'releases/beta-2.md' },
    ]);
  });

  it('keeps the file where it is when the name derives the same slug', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'future')] }));

    await state().updateRelease('releases/1.0.md', { description: 'Ship it' });

    expect(current().releases[0]!.filename).toBe('releases/1.0.md');
    expect(fs.removes).toEqual([]);
    expect(fs.writes).toEqual(['releases/1.0.md']);
  });

  it('rejects a name taken by another release, writing nothing', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'future'), release('2.0', 'future')] }),
    );
    useBoardStore.setState({ selectedReleaseFilename: 'releases/1.0.md' });

    await expect(
      state().updateRelease('releases/1.0.md', { name: '2.0' }),
    ).rejects.toThrow(/already exists/i);

    expect(current().releases[0]!.frontmatter.name).toBe('1.0');
    expect(fs.writes).toEqual([]);
    expect(fs.removes).toEqual([]);
    expect(state().selectedReleaseFilename).toBe('releases/1.0.md');
  });

  it('rolls the snapshot and the selection back when the move fails', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'future')] }));
    useBoardStore.setState({ selectedReleaseFilename: 'releases/1.0.md' });
    fs.failWritesMatching = '*';

    await expect(
      state().updateRelease('releases/1.0.md', { name: 'Beta' }),
    ).rejects.toThrow();

    expect(current().releases[0]!.filename).toBe('releases/1.0.md');
    expect(current().releases[0]!.frontmatter.name).toBe('1.0');
    expect(state().selectedReleaseFilename).toBe('releases/1.0.md');
    expect(state().errorMessage).toMatch(/Failed to save release/);
  });
});

describe('setTheme', () => {
  it('persists the theme to config', async () => {
    const { fs } = setup(snap());

    await state().setTheme('dark');

    expect(state().theme).toBe('dark');
    expect(current().config.theme).toBe('dark');
    expect(fs.files.has(CONFIG_FILENAME)).toBe(true);
  });

  it('rolls back the theme when the config write fails', async () => {
    const { fs } = setup(snap());
    fs.failWritesMatching = CONFIG_FILENAME;

    await state().setTheme('dark');

    expect(state().theme).toBe('light');
    expect(state().errorMessage).toMatch(/failed to save theme/i);
  });
});

describe('setWipLimit', () => {
  it('writes the limit into config and clears it again', async () => {
    const { fs } = setup(snap());

    await state().setWipLimit(3);
    expect(current().config.wipLimits).toEqual({ 'in-progress': 3 });
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('wipLimits');

    await state().setWipLimit(null);
    expect(current().config.wipLimits).toBeUndefined();
    expect(fs.files.get(CONFIG_FILENAME)?.content).not.toContain('wipLimits');
  });

  it('rolls the snapshot back when the config write fails', async () => {
    const { fs } = setup(snap());
    fs.failWritesMatching = CONFIG_FILENAME;

    await state().setWipLimit(3);

    expect(current().config.wipLimits).toBeUndefined();
    expect(state().errorMessage).toMatch(/failed to save wip limit/i);
  });
});

describe('setBoardRelease and setMultipleActiveReleases', () => {
  it('stores the board release and rolls back on a failed write', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current'), release('2.0', 'current')] }));

    await state().setBoardRelease('2.0');
    expect(current().config.boardRelease).toBe('2.0');
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('boardRelease: "2.0"');

    fs.failWritesMatching = CONFIG_FILENAME;
    await state().setBoardRelease('1.0');
    expect(current().config.boardRelease).toBe('2.0');
    expect(state().errorMessage).toMatch(/failed to save the board release/i);
  });

  it('stores the setting and rolls back on a failed write', async () => {
    const { fs } = setup(snap());

    await state().setMultipleActiveReleases(true);
    expect(current().config.multipleActiveReleases).toBe(true);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('multipleActiveReleases: true');

    fs.failWritesMatching = CONFIG_FILENAME;
    await state().setMultipleActiveReleases(false);
    expect(current().config.multipleActiveReleases).toBe(true);
    expect(state().errorMessage).toMatch(/failed to save the setting/i);
  });

  it('carries the stored release through a rename', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));
    await state().setBoardRelease('1.0');

    await state().updateRelease('releases/1.0.md', { name: '1.1' });

    expect(current().config.boardRelease).toBe('1.1');
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('boardRelease: "1.1"');
  });

  it('leaves the stored release alone when another release is renamed', async () => {
    setup(snap({ releases: [release('1.0', 'current'), release('2.0', 'current')] }));
    await state().setBoardRelease('1.0');

    await state().updateRelease('releases/2.0.md', { name: '2.1' });

    expect(current().config.boardRelease).toBe('1.0');
  });
});

describe('setStatusOutsideActiveRelease', () => {
  it('stores the setting and rolls back on a failed write', async () => {
    const { fs } = setup(snap());

    await state().setStatusOutsideActiveRelease(true);
    expect(current().config.statusOutsideActiveRelease).toBe(true);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('statusOutsideActiveRelease: true');

    fs.failWritesMatching = CONFIG_FILENAME;
    await state().setStatusOutsideActiveRelease(false);
    expect(current().config.statusOutsideActiveRelease).toBe(true);
    expect(state().errorMessage).toMatch(/failed to save the setting/i);
  });

  it('writes explicit false when the user turns it off', async () => {
    const { fs } = setup(snap());

    await state().setStatusOutsideActiveRelease(true);
    await state().setStatusOutsideActiveRelease(false);
    expect(current().config.statusOutsideActiveRelease).toBe(false);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('statusOutsideActiveRelease: false');
  });
});

describe('setEditFinishedReleases', () => {
  it('stores the setting and rolls back on a failed write', async () => {
    const { fs } = setup(snap());

    await state().setEditFinishedReleases(true);
    expect(current().config.editFinishedReleases).toBe(true);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('editFinishedReleases: true');

    fs.failWritesMatching = CONFIG_FILENAME;
    await state().setEditFinishedReleases(false);
    expect(current().config.editFinishedReleases).toBe(true);
    expect(state().errorMessage).toMatch(/failed to save the setting/i);
  });

  it('writes explicit false when the user turns it off', async () => {
    const { fs } = setup(snap());

    await state().setEditFinishedReleases(true);
    await state().setEditFinishedReleases(false);
    expect(current().config.editFinishedReleases).toBe(false);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('editFinishedReleases: false');
  });
});

describe('setGitIntegration', () => {
  it('writes the key only once the user turns it off, since absent means on', async () => {
    const { fs } = setup(snap());

    // Already on by default, so turning it on writes nothing.
    await state().setGitIntegration(true);
    expect(current().config.gitIntegration).toBeUndefined();
    expect(fs.writes).toEqual([]);

    await state().setGitIntegration(false);
    expect(current().config.gitIntegration).toBe(false);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain('gitIntegration: false');
  });

  it('rolls back and reports when the write fails', async () => {
    const { fs } = setup(snap());
    fs.failWritesMatching = CONFIG_FILENAME;

    await state().setGitIntegration(false);

    expect(current().config.gitIntegration).toBeUndefined();
    expect(state().errorMessage).toMatch(/failed to save the setting/i);
  });
});

describe('completeOnboarding', () => {
  it('seeds the new config theme from the host default theme', async () => {
    const fs = new MemFs();
    await state().load(fs, 'dark');
    expect(state().status).toBe('onboarding');
    expect(state().theme).toBe('dark');

    await state().completeOnboarding({ projectName: 'New', idPrefix: 'NW' });

    expect(state().status).toBe('ready');
    expect(current().config.theme).toBe('dark');
    expect(state().theme).toBe('dark');
  });

  it('omits the theme when the host provides no default', async () => {
    // defaultTheme persists in the store across loads (it survives reload), so
    // clear the value a previous test left behind before exercising the no-host case.
    useBoardStore.setState({ defaultTheme: null });
    const fs = new MemFs();
    await state().load(fs);

    await state().completeOnboarding({ projectName: 'New', idPrefix: 'NW' });

    expect(current().config.theme).toBeUndefined();
    expect(state().theme).toBe('light');
  });
});

describe('optimistic update rollback', () => {
  it('restores the previous snapshot when a mutation write fails', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));
    const before = current();
    fs.failWritesMatching = '*';

    await expect(state().createRelease({ name: 'Broken' })).rejects.toThrow();

    expect(state().snapshot).toBe(before);
    expect(state().errorMessage).toMatch(/failed to save release/i);
  });
});

const CONFIG_MD = `idPrefix: BD
nextId: 50
projectName: My Project
`;

const RELEASE_MD = `---
release: "1.0"
status: current
---

## Task one

---
id: BD-1
type: feature
status: todo
order: 100
---

body
`;

const BACKLOG_MD = `## Parked

---
id: BD-7
type: tech
status: todo
order: 100
---
`;

// A current release whose open task belongs to an epic, so completing it writes
// the release and the backlog.
const RELEASE_WITH_EPIC_MD = `---
status: current
name: "1.0"
---

## Task one

---
id: BD-1
type: feature
status: todo
order: 100
epic: ui
---

body
`;

const loadFrom = async (files: Record<string, string>): Promise<MemFs> => {
  const fs = new MemFs();
  for (const [path, content] of Object.entries(files)) {
    await fs.write(path, content);
  }
  fs.writes = [];
  await state().load(fs);
  return fs;
};

describe('reload', () => {
  it('re-reads the board from disk', async () => {
    await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD, 'releases/1.0.md': RELEASE_MD });
    expect(current().config.projectName).toBe('My Project');

    const raw = state().rawFs as MemFs;
    raw.files.set(CONFIG_FILENAME, {
      content: CONFIG_MD.replace('My Project', 'Renamed'),
      lastModified: Date.now() + 1,
    });

    await state().reload();

    expect(current().config.projectName).toBe('Renamed');
  });
});

describe('external-change conflict', () => {
  it('opens the conflict modal and rolls back when a target file changed on disk', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });
    const before = current();

    // Simulate an external edit: bump the file's mtime without going through
    // the guarded adapter.
    fs.files.get('releases/1.0.md')!.lastModified += 1000;

    await expect(state().updateTask('BD-1', { title: 'Renamed' })).rejects.toThrow();

    expect(state().conflictOpen).toBe(true);
    expect(state().snapshot).toBe(before);
  });

  it('completes no part of a release when a file it would touch changed on disk', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_WITH_EPIC_MD,
      [BACKLOG_PATH]: BACKLOG_MD,
    });
    const before = current();
    const releaseOnDisk = fs.files.get('releases/1.0.md')!.content;

    // The backlog is written after the release, so a sequence of single writes
    // would already have finished the release by the time this one is refused.
    fs.files.get(BACKLOG_PATH)!.lastModified += 1000;

    await expect(
      state().completeRelease('releases/1.0.md', { kind: 'backlog' }),
    ).rejects.toThrow();

    expect(state().conflictOpen).toBe(true);
    expect(state().snapshot).toBe(before);
    expect(fs.files.get('releases/1.0.md')!.content).toBe(releaseOnDisk);
    expect(fs.writes).toEqual([]);
  });

  it('creates no task and no link when a linked file changed on disk', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
      [BACKLOG_PATH]: BACKLOG_MD,
    });
    const before = current();
    fs.files.get(BACKLOG_PATH)!.lastModified += 1000;

    await expect(
      state().createTask({
        releaseFilename: 'releases/1.0.md',
        title: 'Linked',
        type: 'feature',
        links: [{ type: 'relates', to: 'BD-7' }],
      }),
    ).rejects.toThrow();

    expect(state().conflictOpen).toBe(true);
    expect(state().snapshot).toBe(before);
    expect(fs.writes).toEqual([]);
  });

  it('closes every open dialog, so the Reload modal is the only one on screen', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });

    // Not a reachable combination — one dialog is on screen at a time — but it
    // pins the whole set of visibility fields the conflict has to reset.
    state().openTask('BD-1');
    state().openRelease('releases/1.0.md');
    state().openCompleteRelease('releases/1.0.md');
    state().openStartRelease('releases/1.0.md');
    state().openCreateTask('releases/1.0.md');
    state().openCreateTaskForEpic('ui');
    state().openCreateTaskMenu();
    state().openCreateTaskBacklog();
    state().openCreateRelease();
    state().openCreateEpic();
    state().openSettings();
    state().openCreateDocPage();
    state().openCreateDocFolder();
    state().openDeleteDoc('docs/setup.md');
    expect(state().completeReleaseForFilename).toBe('releases/1.0.md');
    expect(state().dialogStack).toHaveLength(1);

    fs.files.get('releases/1.0.md')!.lastModified += 1000;
    await expect(state().updateTask('BD-1', { title: 'Renamed' })).rejects.toThrow();

    expect(state()).toMatchObject({
      conflictOpen: true,
      selectedTaskId: null,
      selectedEpicSlug: null,
      selectedReleaseFilename: null,
      docPopupPath: null,
      dialogStack: [],
      createTaskForReleaseFilename: null,
      createTaskForEpicSlug: null,
      createTaskOpen: false,
      createTaskBacklog: false,
      createReleaseOpen: false,
      createEpicOpen: false,
      completeReleaseForFilename: null,
      startReleaseForFilename: null,
      settingsOpen: false,
      createDocPageOpen: false,
      createDocFolderOpen: false,
      deleteDocPath: null,
    });
  });

  it('closes the dialogs from any refused write, not just a task edit', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_WITH_EPIC_MD,
      [BACKLOG_PATH]: BACKLOG_MD,
    });
    state().openCompleteRelease('releases/1.0.md');
    state().openTask('BD-1');

    fs.files.get(BACKLOG_PATH)!.lastModified += 1000;
    await expect(
      state().completeRelease('releases/1.0.md', { kind: 'backlog' }),
    ).rejects.toThrow();

    expect(state().conflictOpen).toBe(true);
    expect(state().completeReleaseForFilename).toBeNull();
    expect(state().selectedTaskId).toBeNull();
  });

  it('clears the conflict flag on reload', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });
    fs.files.get('releases/1.0.md')!.lastModified += 1000;
    await expect(state().updateTask('BD-1', { title: 'X' })).rejects.toThrow();
    expect(state().conflictOpen).toBe(true);

    await state().reload();

    expect(state().conflictOpen).toBe(false);
  });
});

describe('task links', () => {
  it('mirrors a link into both files', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );

    await state().addTaskLink('BD-1', 'BD-2', 'relates');

    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-2' },
    ]);
    expect(current().backlog!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-1' },
    ]);
    expect(fs.writes).toEqual(['releases/1.0.md', BACKLOG_PATH]);
  });

  it('removes both records and writes both files', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );
    await state().addTaskLink('BD-1', 'BD-2', 'relates');
    fs.writes = [];

    await state().removeTaskLink('BD-2', 'BD-1', 'relates');

    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toBeUndefined();
    expect(current().backlog!.tasks[0]!.frontmatter.links).toBeUndefined();
    expect(fs.writes).toEqual([BACKLOG_PATH, 'releases/1.0.md']);
  });

  it('writes nothing when the link is already there', async () => {
    const { fs } = setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );
    await state().addTaskLink('BD-1', 'BD-2', 'relates');
    fs.writes = [];

    await state().addTaskLink('BD-1', 'BD-2', 'relates');

    expect(fs.writes).toEqual([]);
  });

  it('mirrors a link into a finished release', async () => {
    const { fs } = setup(
      snap({
        releases: [
          release('1.0', 'current', [task('BD-1')]),
          release('0.9', 'finished', [task('BD-2')]),
        ],
      }),
    );

    await state().addTaskLink('BD-1', 'BD-2', 'relates');

    expect(state().errorMessage).toBeNull();
    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-2' },
    ]);
    expect(current().releases[1]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-1' },
    ]);
    expect(fs.writes).toEqual(['releases/1.0.md', 'releases/0.9.md']);
  });

  it('mirrors a directed relation as its inverse', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );

    await state().addTaskLink('BD-1', 'BD-2', 'blocks');

    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'blocks', to: 'BD-2' },
    ]);
    expect(current().backlog!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'blocked-by', to: 'BD-1' },
    ]);
  });

  it('removes only the named relation of a pair that carries two', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        backlog: backlog([task('BD-2')]),
      }),
    );
    await state().addTaskLink('BD-1', 'BD-2', 'blocks');
    await state().addTaskLink('BD-1', 'BD-2', 'relates');

    await state().removeTaskLink('BD-1', 'BD-2', 'blocks');

    expect(current().releases[0]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-2' },
    ]);
    expect(current().backlog!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-1' },
    ]);
  });

});

describe('docs', () => {
  const docsTree = () => ({
    path: 'docs',
    name: 'docs',
    folders: [
      {
        path: 'docs/guides',
        name: 'guides',
        folders: [],
        pages: [
          {
            path: 'docs/guides/setup.md',
            slug: 'setup',
            frontmatter: { title: 'Setup' },
            body: 'steps',
          },
        ],
        otherEntries: [],
      },
    ],
    pages: [
      { path: 'docs/intro.md', slug: 'intro', frontmatter: { title: 'Intro' }, body: 'hello' },
    ],
    otherEntries: [],
  });

  it('creates a page in the docs root when nothing is selected', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));

    await state().createDocPage('Release Process');

    expect(fs.writes).toEqual(['docs/release-process.md']);
    expect(state().selectedDocPath).toBe('docs/release-process.md');
    expect(current().docs.pages.map((p) => p.path)).toContain('docs/release-process.md');
    expect(fs.files.get('docs/release-process.md')!.content).toContain('title: Release Process');
  });

  it('creates a page inside the selected folder', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));
    state().selectDoc('docs/guides');

    await state().createDocPage('Deploy');

    expect(fs.writes).toEqual(['docs/guides/deploy.md']);
  });

  it('creates a page beside the selected page', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));
    state().selectDoc('docs/guides/setup.md');

    await state().createDocPage('Deploy');

    expect(fs.writes).toEqual(['docs/guides/deploy.md']);
  });

  it('suffixes a colliding filename instead of overwriting the existing page', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));

    await state().createDocPage('Intro');

    expect(fs.writes).toEqual(['docs/intro-2.md']);
    expect(current().docs.pages).toHaveLength(2);
  });

  it('creates an empty folder with mkdir, writing no file', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));

    await state().createDocFolder('drafts');

    expect(fs.dirs.has('docs/drafts')).toBe(true);
    expect(fs.files.size).toBe(0);
    expect(current().docs.folders.map((f) => f.name)).toEqual(['drafts', 'guides']);
  });

  it('saves a page title and body in one write, keeping the filename', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));

    await state().saveDocPage('docs/intro.md', 'Introduction', '# New body');

    expect(fs.writes).toEqual(['docs/intro.md']);
    const written = fs.files.get('docs/intro.md')!.content;
    expect(written).toContain('title: Introduction');
    expect(written).toContain('# New body');
    expect(current().docs.pages[0]!.path).toBe('docs/intro.md');
  });

  it('deletes a page and clears the selection when it was selected', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));
    state().selectDoc('docs/intro.md');

    await state().deleteDocPage('docs/intro.md');

    expect(fs.removes).toEqual(['docs/intro.md']);
    expect(state().selectedDocPath).toBeNull();
    expect(current().docs.pages).toEqual([]);
  });

  it('keeps the selection when another page is deleted', async () => {
    setup(snap({ docs: docsTree() }));
    state().selectDoc('docs/guides/setup.md');

    await state().deleteDocPage('docs/intro.md');

    expect(state().selectedDocPath).toBe('docs/guides/setup.md');
  });

  it('deletes an empty folder and clears the selection when it was selected', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));
    await state().createDocFolder('drafts');

    await state().deleteDocFolder('docs/drafts');

    expect(fs.removes).toEqual(['docs/drafts']);
    expect(state().selectedDocPath).toBeNull();
    expect(current().docs.folders.map((f) => f.name)).toEqual(['guides']);
  });

  it('refuses to delete a folder that still has pages in it', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));

    await state().deleteDocFolder('docs/guides');

    expect(fs.removes).toEqual([]);
    expect(current().docs.folders.map((f) => f.name)).toEqual(['guides']);
    expect(state().errorMessage).toMatch(/empty folder/);
  });

  it('restores the previous tree and selection when a write fails', async () => {
    const { fs } = setup(snap({ docs: docsTree() }));
    fs.failWritesMatching = '*';

    await expect(state().createDocPage('Doomed')).rejects.toThrow();

    expect(current().docs.pages.map((p) => p.path)).toEqual(['docs/intro.md']);
    expect(state().selectedDocPath).toBeNull();
    expect(state().errorMessage).toMatch(/Failed to create page/);
  });

  it('touches only paths under docs/ — never releases, epics or the config', async () => {
    const { fs } = setup(
      snap({ docs: docsTree(), releases: [release('1.0', 'current', [task('BD-1')])] }),
    );

    await state().createDocPage('One');
    await state().createDocFolder('drafts');
    await state().saveDocPage('docs/intro.md', 'Intro', 'x');
    await state().deleteDocPage('docs/intro.md');
    await state().deleteDocPage('docs/guides/setup.md');
    await state().deleteDocFolder('docs/guides');

    for (const path of [...fs.writes, ...fs.removes]) {
      expect(path.startsWith('docs/')).toBe(true);
    }
    expect(fs.files.has(CONFIG_FILENAME)).toBe(false);
  });
});

describe('doc popup', () => {
  it('opens the popup and replaces whatever dialog was open', () => {
    setup(snap());
    useBoardStore.setState({
      selectedTaskId: 'BD-1',
      selectedEpicSlug: null,
      selectedReleaseFilename: null,
      docPopupPath: null,
    });

    state().openDocPopup('docs/intro.md');

    expect(state().docPopupPath).toBe('docs/intro.md');
    expect(state().selectedTaskId).toBeNull();
    expect(state().selectedEpicSlug).toBeNull();
    expect(state().selectedReleaseFilename).toBeNull();
  });

  it('closes the popup without revealing another dialog', () => {
    setup(snap());
    useBoardStore.setState({ docPopupPath: 'docs/intro.md' });

    state().closeDocPopup();

    expect(state().docPopupPath).toBeNull();
    expect(state().selectedTaskId).toBeNull();
  });

  it('replaces the popup with a task dialog when a task ref is opened from it', () => {
    setup(snap());
    useBoardStore.setState({ docPopupPath: 'docs/intro.md' });

    state().openTask('BD-1');

    expect(state().docPopupPath).toBeNull();
    expect(state().selectedTaskId).toBe('BD-1');
  });

  it('View in docs navigates to the Docs tab and dismisses the popup', () => {
    setup(snap());
    useBoardStore.setState({ docPopupPath: 'docs/intro.md', activeTab: 'board' });

    state().openDocPage('docs/intro.md');

    expect(state().activeTab).toBe('docs');
    expect(state().selectedDocPath).toBe('docs/intro.md');
    expect(state().docPopupPath).toBeNull();
  });
});

const docs = () => ({
  path: 'docs',
  name: 'docs',
  folders: [],
  pages: [
    { path: 'docs/intro.md', slug: 'intro', frontmatter: { title: 'Intro' }, body: 'hello' },
  ],
  otherEntries: [],
});

const board = () =>
  snap({
    releases: [release('1.0', 'current', [task('BD-1'), task('BD-2')])],
    epics: [epic('ui')],
    docs: docs(),
  });

describe('dialog back stack', () => {
  it('pushes nothing when a dialog is opened with none already open', () => {
    setup(board());

    state().openTask('BD-1');

    expect(state().dialogStack).toEqual([]);
  });

  it('pushes the origin when one dialog is opened from another', () => {
    setup(board());

    state().openTask('BD-1');
    state().openEpic('ui');

    expect(state().selectedEpicSlug).toBe('ui');
    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([{ kind: 'task', id: 'BD-1' }]);
  });

  it('records one entry per hop across a three-dialog chain', () => {
    setup(board());

    state().openTask('BD-1');
    state().openEpic('ui');
    state().openTask('BD-2');

    expect(state().dialogStack).toEqual([
      { kind: 'task', id: 'BD-1' },
      { kind: 'epic', slug: 'ui' },
    ]);
  });

  it('walks the chain back one step per call', () => {
    setup(board());
    state().openTask('BD-1');
    state().openEpic('ui');
    state().openTask('BD-2');

    state().goBack();
    expect(state().selectedEpicSlug).toBe('ui');
    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([{ kind: 'task', id: 'BD-1' }]);

    state().goBack();
    expect(state().selectedTaskId).toBe('BD-1');
    expect(state().selectedEpicSlug).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });

  it('restores a release and a doc popup from the stack', () => {
    setup(board());

    state().openRelease('releases/1.0.md');
    state().openDocPopup('docs/intro.md');
    expect(state().dialogStack).toEqual([{ kind: 'release', filename: 'releases/1.0.md' }]);

    state().openTask('BD-1');
    state().goBack();

    expect(state().docPopupPath).toBe('docs/intro.md');
    expect(state().selectedTaskId).toBeNull();
  });

  it('is a no-op when the stack is empty', () => {
    setup(board());
    state().openTask('BD-1');

    state().goBack();

    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });

  it('skips an entry whose entity is no longer on the board', () => {
    setup(board());
    state().openTask('BD-1');
    state().openEpic('ui');
    state().openTask('BD-2');
    // BD-1 disappears externally while the user is two dialogs deep.
    useBoardStore.setState({
      snapshot: snap({
        releases: [release('1.0', 'current', [task('BD-2')])],
        epics: [],
        docs: docs(),
      }),
    });

    state().goBack();

    expect(state().selectedEpicSlug).toBeNull();
    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });

  it('clears the stack when a dialog is closed outright', () => {
    setup(board());
    state().openTask('BD-1');
    state().openEpic('ui');

    state().closeEpic();

    expect(state().dialogStack).toEqual([]);
    expect(state().selectedEpicSlug).toBeNull();
  });

  it('clears the stack when leaving for the Docs tab', () => {
    setup(board());
    state().openTask('BD-1');
    state().openDocPopup('docs/intro.md');

    state().openDocPage('docs/intro.md');

    expect(state().dialogStack).toEqual([]);
  });

  it('clears the stack when the open task is deleted', async () => {
    setup(board());
    state().openEpic('ui');
    state().openTask('BD-1');
    expect(state().dialogStack).toEqual([{ kind: 'epic', slug: 'ui' }]);

    await state().deleteTask('BD-1');

    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });
});

describe('repo file popup', () => {
  it('takes over from the dialog it was opened from and remembers it', () => {
    setup(board());
    state().openTask('BD-1');

    state().openRepoFilePopup('packages/cli/src/app.ts');

    expect(state().repoFilePopupPath).toBe('packages/cli/src/app.ts');
    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([{ kind: 'task', id: 'BD-1' }]);
  });

  it('starts an empty stack when opened with no dialog on screen', () => {
    setup(board());

    state().openRepoFilePopup('README.md');

    expect(state().dialogStack).toEqual([]);
  });

  it('is restored from the stack on the way back', () => {
    setup(board());
    state().openRepoFilePopup('README.md');
    state().openTask('BD-1');

    state().goBack();

    expect(state().repoFilePopupPath).toBe('README.md');
    expect(state().selectedTaskId).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });

  it('is never skipped on the way back, since nothing resolves it', () => {
    setup(board());
    state().openRepoFilePopup('gone/from/disk.ts');
    state().openTask('BD-1');
    // The board reloads without the epic; a repo file is outside the snapshot
    // either way, so the entry still stands.
    useBoardStore.setState({
      snapshot: snap({
        releases: [release('1.0', 'current', [task('BD-1')])],
        epics: [],
        docs: docs(),
      }),
    });

    state().goBack();

    expect(state().repoFilePopupPath).toBe('gone/from/disk.ts');
  });

  it('closes on its own and drops the stack', () => {
    setup(board());
    state().openTask('BD-1');
    state().openRepoFilePopup('README.md');

    state().closeRepoFilePopup();

    expect(state().repoFilePopupPath).toBeNull();
    expect(state().dialogStack).toEqual([]);
  });

  it('is closed by the conflict modal like every other dialog', () => {
    setup(board());
    state().openRepoFilePopup('README.md');

    state().openConflict();

    expect(state().repoFilePopupPath).toBeNull();
    expect(state().conflictOpen).toBe(true);
  });
});

describe('a file the parser could not fully read', () => {
  const guarded = (inner: MemFs, problems: ParseProblem[]): GuardedFs =>
    createGuardedFs(inner, {
      versions: {},
      problems,
      onConflict: () => state().openConflict(),
      onUnreadable: (path, matching) => state().openUnwritable(path, matching),
    });

  const brokenTask = (file: string): ParseProblem => ({
    level: 'error',
    scope: 'task',
    file,
    taskIndex: 1,
    message: 'Invalid task frontmatter YAML: bad indentation',
  });

  it('refuses the write, opens the modal and rolls the change back', async () => {
    const { fs } = setup(
      snap({ releases: [release('1.0', 'current', [task('BD-1'), task('BD-2')])] }),
    );
    const problem = brokenTask('releases/1.0.md');
    useBoardStore.setState({ fs: guarded(fs, [problem]), selectedTaskId: 'BD-1' });

    // Rethrown like any write failure; the drag handler swallows it.
    await expect(state().moveTask('BD-1', 'in-progress', null)).rejects.toThrow();

    expect(fs.writes).toEqual([]);
    expect(current().releases[0]!.tasks[0]!.frontmatter.status).toBe('todo');
    expect(state().unwritableFile).toEqual({
      path: 'releases/1.0.md',
      problems: [problem],
    });
    // The refusal closes whatever was on screen, like the conflict does.
    expect(state().selectedTaskId).toBeNull();
  });

  it('refuses a move between two containers whole when the destination is broken', async () => {
    const { fs } = setup(
      snap({
        releases: [
          release('1.0', 'current', [task('BD-1')]),
          release('2.0', 'future', [task('BD-2')]),
        ],
      }),
    );
    useBoardStore.setState({ fs: guarded(fs, [brokenTask('releases/2.0.md')]) });

    await expect(state().moveTaskToRelease('BD-1', 'releases/2.0.md')).rejects.toThrow();

    // Neither end is written: the source must not lose the task to a destination
    // that never gets it.
    expect(fs.writes).toEqual([]);
    expect(current().releases[0]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
  });

  const openModal = (): void => {
    useBoardStore.setState({
      unwritableFile: { path: 'releases/1.0.md', problems: [brokenTask('releases/1.0.md')] },
    });
  };

  it('clears the modal when the board is reloaded', async () => {
    await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD, 'releases/1.0.md': RELEASE_MD });
    openModal();

    await state().reload();

    expect(state().status).toBe('ready');
    expect(state().unwritableFile).toBeNull();
  });

  it('clears the modal when the watcher reloads the board silently', async () => {
    await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD, 'releases/1.0.md': RELEASE_MD });
    openModal();

    await state().reloadSilent();

    expect(state().status).toBe('ready');
    expect(state().unwritableFile).toBeNull();
  });

  it('does not put the release dialog back on top of the modal', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current', [task('BD-1')])] }));
    useBoardStore.setState({
      fs: guarded(fs, [brokenTask('releases/1.0.md')]),
      selectedReleaseFilename: 'releases/1.0.md',
    });

    await expect(state().updateRelease('releases/1.0.md', { name: '1.1' })).rejects.toThrow();

    expect(state().selectedReleaseFilename).toBeNull();
    expect(state().unwritableFile?.path).toBe('releases/1.0.md');
  });

  it('still writes a container of its own that parsed cleanly', async () => {
    const { fs } = setup(
      snap({
        releases: [
          release('1.0', 'current', [task('BD-1')]),
          release('2.0', 'future', [task('BD-2')]),
        ],
      }),
    );
    useBoardStore.setState({ fs: guarded(fs, [brokenTask('releases/2.0.md')]) });

    await state().moveTask('BD-1', 'in-progress', null);

    expect(fs.writes).toEqual(['releases/1.0.md']);
    expect(state().unwritableFile).toBeNull();
  });
});

describe('the layout conversion', () => {
  const OLD_EPIC_MD = `---
name: UI
color: "#1f6feb"
---

## Buttons

---
id: BD-5
type: feature
status: todo
order: 200
---
`;
  const OLD_NO_EPIC_MD = `---
{}
---

## Loose

---
id: BD-3
type: bug
status: todo
order: 100
---
`;

  it('shows an old-layout board as it always was and writes nothing on load', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'epics/ui.md': OLD_EPIC_MD,
      'epics/no_epic.md': OLD_NO_EPIC_MD,
    });
    expect(fs.writes).toEqual([]);
    expect(current().backlog!.tasks.map((t) => [t.frontmatter.id, t.frontmatter.epic])).toEqual([
      ['BD-3', undefined],
      ['BD-5', 'ui'],
    ]);
  });

  it('lands with the first write, together with the stamp, and only once', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'epics/ui.md': OLD_EPIC_MD,
      'epics/no_epic.md': OLD_NO_EPIC_MD,
    });

    await state().setTheme('dark');

    expect(fs.files.has('epics/no_epic.md')).toBe(false);
    expect(fs.files.get('epics/ui.md')!.content).toBe('---\nname: UI\ncolor: "#1f6feb"\n---\n');
    expect(fs.files.get(BACKLOG_PATH)!.content).toMatch(/^epic: ui$/m);
    expect(fs.files.get(CONFIG_FILENAME)!.content).toContain(`minVersion: ${MIN_COMPATIBLE_VERSION}`);

    fs.writes = [];
    await state().setTheme('light');
    expect(fs.writes).toEqual([CONFIG_FILENAME]);
  });

  it('lets a backlog edit on an old-layout board land as one converted file', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'epics/ui.md': OLD_EPIC_MD,
    });

    await state().updateTask('BD-5', { epic: null });

    expect(fs.files.get('epics/ui.md')!.content).not.toContain('BD-5');
    expect(fs.files.get(BACKLOG_PATH)!.content).toContain('id: BD-5');
    expect(fs.files.get(BACKLOG_PATH)!.content).not.toMatch(/^epic:/m);
  });

  it('keeps stamp and conversion pending when the first write is refused', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
      'epics/ui.md': OLD_EPIC_MD,
    });
    fs.files.get('releases/1.0.md')!.lastModified += 1000;
    await expect(state().updateTask('BD-1', { title: 'Renamed' })).rejects.toThrow();
    expect(current().config.minVersion).toBeUndefined();
    expect(fs.files.get('epics/ui.md')!.content).toBe(OLD_EPIC_MD);

    await state().setTheme('dark');
    expect(fs.files.get('epics/ui.md')!.content).not.toContain('BD-5');
    expect(fs.files.get(CONFIG_FILENAME)!.content).toContain(`minVersion: ${MIN_COMPATIBLE_VERSION}`);
  });

  it('takes a fresh conversion from a silent reload, never the stale one', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'epics/ui.md': OLD_EPIC_MD,
    });
    // Someone converted the board elsewhere, and the host refreshed.
    fs.files.set('epics/ui.md', {
      content: '---\nname: UI\ncolor: "#1f6feb"\n---\n',
      lastModified: Date.now() + 1,
    });
    fs.files.set(BACKLOG_PATH, {
      content: '## Buttons\n\n---\nid: BD-5\ntype: feature\nstatus: todo\nepic: ui\norder: 200\n---\n',
      lastModified: Date.now() + 1,
    });
    await state().reloadSilent();

    await state().setTheme('dark');
    expect((fs.files.get(BACKLOG_PATH)!.content as string).match(/id: BD-5/g)).toHaveLength(1);
  });

  describe('the notice', () => {
    beforeEach(() => {
      useBoardStore.setState({ conversionNoticeOwed: false, conflictOpen: false });
    });

    const OLD_BOARD = {
      [CONFIG_FILENAME]: CONFIG_MD,
      'epics/ui.md': OLD_EPIC_MD,
      'epics/no_epic.md': OLD_NO_EPIC_MD,
    };

    it('is owed once the write that completes the conversion lands, and not before', async () => {
      await loadFrom(OLD_BOARD);
      expect(state().conversionNoticeOwed).toBe(false);
      await state().setTheme('dark');
      expect(state().conversionNoticeOwed).toBe(true);
    });

    it('is not owed after a partial conversion', async () => {
      await loadFrom({
        ...OLD_BOARD,
        'epics/ui.md': `${OLD_EPIC_MD}\n## Broken\n\n---\nid: [\n---\n`,
      });
      await state().setTheme('dark');
      expect(state().conversionNoticeOwed).toBe(false);
    });

    it('is not owed when the write is refused', async () => {
      const fs = await loadFrom({ ...OLD_BOARD, 'releases/1.0.md': RELEASE_MD });
      fs.files.get('releases/1.0.md')!.lastModified += 1000;
      await expect(state().updateTask('BD-1', { title: 'Renamed' })).rejects.toThrow();
      expect(state().conversionNoticeOwed).toBe(false);
    });

    it('is not owed on a board already in the current layout', async () => {
      await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD });
      await state().setTheme('dark');
      expect(state().conversionNoticeOwed).toBe(false);
    });

    it('survives the refusal modals and a reload, and is gone once dismissed', async () => {
      await loadFrom(OLD_BOARD);
      await state().setTheme('dark');
      state().openUnwritable('epics/ui.md', []);
      state().openConflict();
      expect(state().conversionNoticeOwed).toBe(true);
      await state().reload();
      await state().reloadSilent();
      expect(state().conversionNoticeOwed).toBe(true);
      // The reloaded board is in the current layout: further writes owe nothing new.
      state().dismissConversionNotice();
      await state().setTheme('light');
      expect(state().conversionNoticeOwed).toBe(false);
    });
  });
});

describe('isAnyDialogOpen', () => {
  beforeEach(() => {
    setup(snap());
    useBoardStore.setState({ conflictOpen: false, settingsOpen: false });
  });

  it('is false with nothing open', () => {
    expect(isAnyDialogOpen(state())).toBe(false);
  });

  it('counts a detail dialog, Settings and both refusal modals', () => {
    state().openTask('BD-1');
    expect(isAnyDialogOpen(state())).toBe(true);
    useBoardStore.setState({ selectedTaskId: null, settingsOpen: true });
    expect(isAnyDialogOpen(state())).toBe(true);
    useBoardStore.setState({ settingsOpen: false });
    state().openUnwritable('releases/1.0.md', []);
    expect(isAnyDialogOpen(state())).toBe(true);
    state().closeUnwritable();
    state().openConflict();
    expect(isAnyDialogOpen(state())).toBe(true);
  });
});

describe('minVersion', () => {
  it('refuses a board whose minVersion is above this build', async () => {
    const fs = new MemFs();
    await fs.write(
      CONFIG_FILENAME,
      `idPrefix: BD\nnextId: 1\nprojectName: P\nminVersion: 99.0.0\n`,
    );
    fs.writes = [];
    await state().load(fs);
    expect(state().status).toBe('error');
    expect(state().snapshot).toBeNull();
    expect(state().errorMessage).toContain('99.0.0');
    expect(state().errorMessage).toContain(APP_VERSION);
    expect(state().errorMessage).toMatch(/update boardown/i);
    expect(fs.writes).toEqual([]);
  });

  it('stamps minVersion on a config write of a board that had none', async () => {
    const fs = await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD });
    await state().setTheme('dark');
    expect(current().config.minVersion).toBe(MIN_COMPATIBLE_VERSION);
    expect(fs.files.get(CONFIG_FILENAME)?.content).toContain(
      `minVersion: ${MIN_COMPATIBLE_VERSION}`,
    );
  });

  it('pairs a board write with config while the recorded value is behind', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });
    fs.writes = [];
    await state().updateTask('BD-1', { title: 'Renamed' });
    expect(fs.writes.sort()).toEqual([CONFIG_FILENAME, 'releases/1.0.md'].sort());
    expect(current().config.minVersion).toBe(MIN_COMPATIBLE_VERSION);
    fs.writes = [];
    await state().updateTask('BD-1', { title: 'Again' });
    expect(fs.writes).toEqual(['releases/1.0.md']);
  });

  it('records only the stamp once a write lands, keeping a config change made meanwhile', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = fs.write.bind(fs);
    fs.write = async (path, content) => {
      if (path === 'releases/1.0.md') await held;
      await write(path, content);
    };

    const slow = state().updateTask('BD-1', { title: 'Renamed' });
    await state().setTheme('dark');
    release();
    await slow;

    expect(current().config.theme).toBe('dark');
    expect(current().config.minVersion).toBe(MIN_COMPATIBLE_VERSION);
  });

  it('replaces a loaded board when a silent reload finds it too new', async () => {
    const fs = await loadFrom({ [CONFIG_FILENAME]: CONFIG_MD });
    expect(state().status).toBe('ready');
    fs.files.set(CONFIG_FILENAME, {
      content: `${CONFIG_MD}minVersion: 99.0.0\n`,
      lastModified: Date.now() + 1,
    });
    await state().reloadSilent();
    expect(state().status).toBe('error');
    expect(state().snapshot).toBeNull();
    expect(state().errorMessage).toContain('99.0.0');
  });

  it('creates a task in one writeAll of the container and config', async () => {
    const { fs } = setup(snap({ releases: [release('1.0', 'current')] }));
    await state().createTask({
      releaseFilename: 'releases/1.0.md',
      title: 'New',
      type: 'feature',
    });
    expect(fs.writeAllCalls).toEqual([['releases/1.0.md', CONFIG_FILENAME]]);
  });

  it('does not rename a release when the stamp write fails', async () => {
    const fs = await loadFrom({
      [CONFIG_FILENAME]: CONFIG_MD,
      'releases/1.0.md': RELEASE_MD,
    });
    fs.failWritesMatching = CONFIG_FILENAME;
    await expect(state().updateRelease('releases/1.0.md', { name: '1.1' })).rejects.toThrow();
    expect(fs.files.has('releases/1.0.md')).toBe(true);
    expect([...fs.files.keys()].some((path) => path.startsWith('releases/1') && path !== 'releases/1.0.md')).toBe(
      false,
    );
  });
});
