import type {
  Backlog,
  BoardConfig,
  BoardSnapshot,
  Epic,
  FileStat,
  FsAdapter,
  Release,
  ReleaseStatus,
  Task,
} from '@boardown/core';
import { BACKLOG_PATH, CONFIG_FILENAME } from '@boardown/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './store';

// In-memory adapter mirroring packages/core's reference impl, plus a switch to
// simulate write failures so we can assert optimistic-update rollback.
class MemFs implements FsAdapter {
  files = new Map<string, { content: string; lastModified: number }>();
  writes: string[] = [];
  // When set, any write whose path includes this substring throws.
  failWritesMatching: string | null = null;

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return entry.content;
  }

  async write(path: string, content: string): Promise<void> {
    if (
      this.failWritesMatching !== null &&
      (this.failWritesMatching === '*' || path.includes(this.failWritesMatching))
    ) {
      throw new Error('disk full');
    }
    this.files.set(path, { content, lastModified: Date.now() });
    this.writes.push(path);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tail = key.slice(prefix.length);
      const slash = tail.indexOf('/');
      out.add(slash === -1 ? tail : tail.slice(0, slash));
    }
    return [...out];
  }

  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    return entry === undefined ? null : { lastModified: entry.lastModified };
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

const epic = (slug: string, tasks: Task[] = []): Epic => ({
  filename: `epics/${slug}.md`,
  slug,
  frontmatter: { name: slug, color: '#1f6feb' },
  preamble: '',
  tasks,
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
  });
  return { fs };
};

const state = () => useBoardStore.getState();
const current = () => state().snapshot!;

beforeEach(() => {
  useBoardStore.setState({ errorMessage: null });
});

describe('createTask', () => {
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

  it('adds a backlog task to the epic file without an epic frontmatter field', async () => {
    setup(snap({ epics: [epic('parser')] }));

    await state().createTask({ title: 'In epic', type: 'tech', epic: 'parser' });

    const tasks = current().epics[0]!.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.frontmatter.epic).toBeUndefined();
  });

  it('lazily creates the no_epic backlog for an epic-less, release-less task', async () => {
    const { fs } = setup(snap({ backlog: null }));

    await state().createTask({ title: 'Loose', type: 'bug' });

    expect(current().backlog).not.toBeNull();
    expect(current().backlog!.tasks).toHaveLength(1);
    expect(fs.files.has(BACKLOG_PATH)).toBe(true);
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

  it('relocates a backlog task to an epic file when its epic changes', async () => {
    setup(snap({ epics: [epic('parser')], backlog: backlog([task('BD-1')]) }));

    await state().updateTask('BD-1', { epic: 'parser' });

    expect(current().backlog!.tasks).toHaveLength(0);
    expect(current().epics[0]!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
  });
});

describe('moveTaskToRelease', () => {
  it('moves an epic task into a release', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current')],
        epics: [epic('parser', [task('BD-1', { epic: 'parser' })])],
      }),
    );

    await state().moveTaskToRelease('BD-1', 'releases/1.0.md');

    expect(current().epics[0]!.tasks).toHaveLength(0);
    expect(current().releases[0]!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
  });

  it('falls back to the epic file when the release is removed', async () => {
    setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1', { epic: 'parser' })])],
        epics: [epic('parser')],
      }),
    );

    await state().moveTaskToRelease('BD-1', null);

    expect(current().releases[0]!.tasks).toHaveLength(0);
    expect(current().epics[0]!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
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
    setup(
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
    setup(
      snap({
        releases: [release('1.0', 'current', [task('BD-1', { status: 'todo' })])],
        backlog: backlog(),
      }),
    );

    await state().completeRelease({ kind: 'backlog' });

    expect(current().releases[0]!.frontmatter.status).toBe('finished');
    expect(current().backlog!.tasks.map((t) => t.frontmatter.id)).toContain(
      'BD-1',
    );
  });

  it('reports an error when there is no current release to complete', async () => {
    setup(snap({ releases: [release('1.1', 'future')] }));

    await state().completeRelease({ kind: 'backlog' });

    expect(state().errorMessage).toMatch(/no current release/i);
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
