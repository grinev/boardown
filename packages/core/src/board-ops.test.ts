import { describe, expect, it } from 'vitest';
import {
  addTaskLink,
  BoardOpError,
  changeTaskStatus,
  moveTaskInContainer,
  completeRelease,
  removeAllTaskLinks,
  removeTaskLink,
  createEpic,
  createRelease,
  startRelease,
  createTask,
  deleteTask,
  deleteTaskWithLinks,
  editEpic,
  editRelease,
  editTask,
  emptyBacklog,
  inProgressCount,
  isWipLimitReached,
  wipLimitFor,
  moveTaskBetweenContainers,
  reorderTask,
  reorderTaskInBacklog,
} from './board-ops.js';
import { parseBacklog } from './parser.js';
import { serializeBacklog } from './serializer.js';
import type {
  Backlog,
  BoardConfig,
  Epic,
  Release,
  Task,
  TaskStatus,
} from './schemas.js';

const config: BoardConfig = {
  idPrefix: 'BD',
  nextId: 10,
  projectName: 'My Project',
};

const task = (
  id: string,
  status: TaskStatus,
  order: number,
  title = id,
): Task => ({
  title,
  description: '',
  frontmatter: { id, type: 'feature', status, order },
});

const release = (...tasks: Task[]): Release => ({
  filename: 'releases/1.10.md',
  slug: '1.10',
  frontmatter: { status: 'current' },
  preamble: '',
  tasks,
});

describe('createTask', () => {
  it('assigns sequential id, places at end of column, bumps config.nextId', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const result = createTask(r0, config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
    });
    expect(result.task.frontmatter.id).toBe('BD-10');
    expect(result.task.frontmatter.type).toBe('feature');
    expect(result.task.frontmatter.order).toBe(200);
    expect(result.config.nextId).toBe(11);
    expect(result.container.tasks).toHaveLength(2);
  });

  it('places new task after the last order in the container regardless of status', () => {
    const r0 = release(task('BD-1', 'todo', 500));
    const result = createTask(r0, config, {
      title: 'X',
      type: 'tech',
      status: 'in-progress',
    });
    expect(result.task.frontmatter.order).toBe(600);
    expect(result.task.frontmatter.type).toBe('tech');
  });

  it('writes no priority key when the input carries none', () => {
    const result = createTask(release(), config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
    });
    expect(result.task.frontmatter.priority).toBeUndefined();
    expect('priority' in result.task.frontmatter).toBe(false);
  });

  it('writes the priority the input carries', () => {
    const result = createTask(release(), config, {
      title: 'New',
      type: 'bug',
      priority: 'critical',
      status: 'todo',
    });
    expect(result.task.frontmatter.priority).toBe('critical');
  });

  it('starts container from 100 when empty', () => {
    const r0 = release();
    const result = createTask(r0, config, {
      title: 'First',
      type: 'feature',
      status: 'todo',
    });
    expect(result.task.frontmatter.order).toBe(100);
  });
});

describe('editTask', () => {
  it('updates title and description, preserves frontmatter', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', { title: 'Updated', description: 'desc' });
    expect(r1.tasks[0]!.title).toBe('Updated');
    expect(r1.tasks[0]!.description).toBe('desc');
    expect(r1.tasks[0]!.frontmatter.order).toBe(100);
  });

  it('clears epic with null', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.epic = 'parser';
    const r0 = release(t);
    const r1 = editTask(r0, config, 'BD-1', { epic: null });
    expect(r1.tasks[0]!.frontmatter.epic).toBeUndefined();
  });

  it('updates type', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', { type: 'bug' });
    expect(r1.tasks[0]!.frontmatter.type).toBe('bug');
  });

  it('updates priority', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', { priority: 'high' });
    expect(r1.tasks[0]!.frontmatter.priority).toBe('high');
  });

  // Setting the neutral level is a set, not a clear: the key stays in the file.
  it('writes medium rather than clearing the key', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', { priority: 'high' });
    const r2 = editTask(r1, config, 'BD-1', { priority: 'medium' });
    expect(r2.tasks[0]!.frontmatter.priority).toBe('medium');
  });

  it('leaves priority alone when the patch does not mention it', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.priority = 'low';
    const r1 = editTask(release(t), config, 'BD-1', { title: 'Updated' });
    expect(r1.tasks[0]!.frontmatter.priority).toBe('low');
  });

  it('changes status and places task at the end of the container', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'done', 100),
      task('BD-3', 'done', 200),
    );
    const r1 = editTask(r0, config, 'BD-1', { status: 'done' });
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('done');
    expect(moved.frontmatter.order).toBe(300);
  });

  it('keeps order untouched when status patch matches current status', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', { status: 'todo', title: 'Same column' });
    expect(r1.tasks[0]!.frontmatter.order).toBe(100);
    expect(r1.tasks[0]!.title).toBe('Same column');
  });

  it('sets the checklist', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', {
      checklist: [{ id: 'c1', text: 'Do the thing', done: false }],
    });
    expect(r1.tasks[0]!.frontmatter.checklist).toEqual([
      { id: 'c1', text: 'Do the thing', done: false },
    ]);
  });

  it('clears the checklist when patched with an empty array', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.checklist = [{ id: 'c1', text: 'Old', done: true }];
    const r0 = release(t);
    const r1 = editTask(r0, config, 'BD-1', { checklist: [] });
    expect(r1.tasks[0]!.frontmatter.checklist).toBeUndefined();
  });

  it('sets the notes', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, config, 'BD-1', {
      notes: [{ id: 'n1', text: 'A note', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(r1.tasks[0]!.frontmatter.notes).toEqual([
      { id: 'n1', text: 'A note', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('clears the notes when patched with an empty array', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.notes = [{ id: 'n1', text: 'Old', createdAt: '2026-01-01T00:00:00.000Z' }];
    const r0 = release(t);
    const r1 = editTask(r0, config, 'BD-1', { notes: [] });
    expect(r1.tasks[0]!.frontmatter.notes).toBeUndefined();
  });
});

describe('editRelease', () => {
  const baseRelease = (): Release => ({
    filename: 'releases/1.10.md',
    slug: '1.10',
    frontmatter: {
      status: 'current',
      name: '1.10',
      description: 'old description',
      startDate: '2026-05-01',
    },
    preamble: 'preamble text',
    tasks: [task('BD-1', 'todo', 100)],
  });

  const others = (...releases: Release[]): Release[] => releases;

  it('moves the file to the slug the new name derives, carrying everything else', () => {
    const release = baseRelease();
    const r = editRelease(release, { name: 'Beta' }, others(release));
    expect(r.frontmatter.name).toBe('Beta');
    expect(r.frontmatter.description).toBe('old description');
    expect(r.frontmatter.status).toBe('current');
    expect(r.frontmatter.startDate).toBe('2026-05-01');
    expect(r.slug).toBe('beta');
    expect(r.filename).toBe('releases/beta.md');
    expect(r.preamble).toBe('preamble text');
    expect(r.tasks).toHaveLength(1);
  });

  it('keeps the path when the new name derives the same slug', () => {
    const release = baseRelease();
    const r = editRelease(release, { name: '1.10' }, others(release));
    expect(r.frontmatter.name).toBe('1.10');
    expect(r.slug).toBe('1.10');
    expect(r.filename).toBe('releases/1.10.md');
  });

  it('keeps the path when the slug differs only in case', () => {
    const release: Release = { ...baseRelease(), filename: 'releases/Beta.md', slug: 'Beta' };
    const r = editRelease(release, { name: 'BETA' }, others(release));
    expect(r.frontmatter.name).toBe('BETA');
    expect(r.slug).toBe('Beta');
    expect(r.filename).toBe('releases/Beta.md');
  });

  it('updates description only, leaving the path alone', () => {
    const release = baseRelease();
    const r = editRelease(release, { description: 'fresh' }, others(release));
    expect(r.frontmatter.description).toBe('fresh');
    expect(r.frontmatter.name).toBe('1.10');
    expect(r.filename).toBe('releases/1.10.md');
  });

  it('updates name and description together', () => {
    const release = baseRelease();
    const r = editRelease(release, { name: 'X', description: 'Y' }, others(release));
    expect(r.frontmatter.name).toBe('X');
    expect(r.frontmatter.description).toBe('Y');
    expect(r.filename).toBe('releases/x.md');
  });

  it('trims the values', () => {
    const release = baseRelease();
    const r = editRelease(release, { name: '  X  ', description: ' Y ' }, others(release));
    expect(r.frontmatter.name).toBe('X');
    expect(r.frontmatter.description).toBe('Y');
  });

  it('drops the description key when cleared', () => {
    const release = baseRelease();
    const r = editRelease(release, { description: '   ' }, others(release));
    expect('description' in r.frontmatter).toBe(false);
  });

  it('rejects a blank name', () => {
    const release = baseRelease();
    expect(() => editRelease(release, { name: '  ' }, others(release))).toThrow(
      /name is required/i,
    );
  });

  it('rejects a name with nothing usable in a filename', () => {
    const release = baseRelease();
    expect(() => editRelease(release, { name: '???' }, others(release))).toThrow(
      /allowed in a filename/i,
    );
  });

  it('rejects a name colliding with another release, case-insensitively', () => {
    const release = baseRelease();
    const other: Release = {
      filename: 'releases/beta.md',
      slug: 'beta',
      frontmatter: { status: 'future', name: 'beta' },
      preamble: '',
      tasks: [],
    };
    expect(() => editRelease(release, { name: 'BETA' }, others(release, other))).toThrow(
      /already exists: beta/i,
    );
  });

  it('adds a name to a release that has none', () => {
    const legacy: Release = {
      filename: 'releases/1.10.md',
      slug: '1.10',
      frontmatter: { status: 'future' },
      preamble: '',
      tasks: [],
    };
    const r = editRelease(legacy, { name: 'Named' }, others(legacy));
    expect(r.frontmatter.name).toBe('Named');
    expect(r.filename).toBe('releases/named.md');
  });

  it('refuses to edit a finished release', () => {
    const finished: Release = {
      ...baseRelease(),
      frontmatter: { ...baseRelease().frontmatter, status: 'finished' },
    };
    expect(() => editRelease(finished, { name: 'X' }, others(finished))).toThrow(/finished/i);
  });
});

describe('editEpic', () => {
  const baseEpic = (): Epic => ({
    filename: 'epics/parser.md',
    slug: 'parser',
    frontmatter: { name: 'Parser', color: '#1f6feb' },
    preamble: 'old preamble',
    tasks: [task('BD-1', 'todo', 100)],
  });

  it('updates name only', () => {
    const e = editEpic(baseEpic(), { name: 'New Parser' });
    expect(e.frontmatter.name).toBe('New Parser');
    expect(e.preamble).toBe('old preamble');
    expect(e.frontmatter.color).toBe('#1f6feb');
    expect(e.slug).toBe('parser');
    expect(e.filename).toBe('epics/parser.md');
    expect(e.tasks).toHaveLength(1);
  });

  it('updates preamble only', () => {
    const e = editEpic(baseEpic(), { preamble: 'fresh notes' });
    expect(e.preamble).toBe('fresh notes');
    expect(e.frontmatter.name).toBe('Parser');
  });

  it('updates name and preamble together', () => {
    const e = editEpic(baseEpic(), { name: 'X', preamble: 'Y' });
    expect(e.frontmatter.name).toBe('X');
    expect(e.preamble).toBe('Y');
  });

  it('updates color only', () => {
    const e = editEpic(baseEpic(), { color: '#22c55e' });
    expect(e.frontmatter.color).toBe('#22c55e');
    expect(e.frontmatter.name).toBe('Parser');
    expect(e.preamble).toBe('old preamble');
    expect(e.tasks).toHaveLength(1);
  });

  it('updates color together with name and preamble', () => {
    const e = editEpic(baseEpic(), { name: 'X', preamble: 'Y', color: '#eab308' });
    expect(e.frontmatter).toEqual({ name: 'X', color: '#eab308' });
    expect(e.preamble).toBe('Y');
  });

  it('empty patch returns equivalent epic', () => {
    const e = editEpic(baseEpic(), {});
    expect(e.frontmatter.name).toBe('Parser');
    expect(e.frontmatter.color).toBe('#1f6feb');
    expect(e.preamble).toBe('old preamble');
    expect(e.tasks).toHaveLength(1);
  });
});

describe('deleteTask', () => {
  it('removes the task', () => {
    const r0 = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));
    const r1 = deleteTask(r0, 'BD-1');
    expect(r1.tasks).toHaveLength(1);
    expect(r1.tasks[0]!.frontmatter.id).toBe('BD-2');
  });
});

describe('deleteTaskWithLinks', () => {
  const linked = (id: string, ...to: string[]): Task => ({
    ...task(id, 'todo', 100),
    frontmatter: {
      ...task(id, 'todo', 100).frontmatter,
      links: to.map((t) => ({ type: 'relates' as const, to: t })),
    },
  });

  const epicOf = (slug: string, ...tasks: Task[]): Epic => ({
    filename: `epics/${slug}.md`,
    slug,
    frontmatter: { name: slug, color: '#fff' },
    preamble: '',
    tasks,
  });

  const finished = (...tasks: Task[]): Release => ({
    filename: 'releases/1.0.md',
    slug: '1.0',
    frontmatter: { status: 'finished' },
    preamble: '',
    tasks,
  });

  it('removes the task and reports only its file when it has no links', () => {
    const r0 = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));
    const result = deleteTaskWithLinks([r0, epicOf('ui', task('BD-3', 'todo', 300))], 'BD-1');
    expect(result.changedFilenames).toEqual([r0.filename]);
    expect(result.containers[0]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-2']);
  });

  it('strips the mirrored record from a linked task in another container', () => {
    const r0 = release(linked('BD-1', 'BD-2'));
    const e0 = epicOf('ui', linked('BD-2', 'BD-1'));
    const result = deleteTaskWithLinks([r0, e0], 'BD-1');
    expect(result.changedFilenames).toEqual([r0.filename, e0.filename]);
    expect(result.containers[1]!.tasks[0]!.frontmatter.links).toBeUndefined();
  });

  it('strips the mirrored record from a sibling in the same container', () => {
    const r0 = release(linked('BD-1', 'BD-2'), linked('BD-2', 'BD-1'));
    const result = deleteTaskWithLinks([r0], 'BD-1');
    expect(result.changedFilenames).toEqual([r0.filename]);
    expect(result.containers[0]!.tasks).toHaveLength(1);
    expect(result.containers[0]!.tasks[0]!.frontmatter.links).toBeUndefined();
  });

  it('keeps other links of the survivor', () => {
    const r0 = release(linked('BD-1', 'BD-2'));
    const e0 = epicOf('ui', linked('BD-2', 'BD-1', 'BD-9'));
    const result = deleteTaskWithLinks([r0, e0], 'BD-1');
    expect(result.containers[1]!.tasks[0]!.frontmatter.links).toEqual([
      { type: 'relates', to: 'BD-9' },
    ]);
  });

  it('leaves an archived counterpart untouched', () => {
    const r0 = release(linked('BD-1', 'BD-2'));
    const archived = finished(linked('BD-2', 'BD-1'));
    const result = deleteTaskWithLinks([r0, archived], 'BD-1');
    expect(result.changedFilenames).toEqual([r0.filename]);
    expect(result.containers[1]).toBe(archived);
  });

  it('tolerates a one-sided record', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const e0 = epicOf('ui', linked('BD-2', 'BD-1'));
    const result = deleteTaskWithLinks([r0, e0], 'BD-1');
    expect(result.changedFilenames).toEqual([r0.filename, e0.filename]);
    expect(result.containers[1]!.tasks[0]!.frontmatter.links).toBeUndefined();
  });

  it('keeps the container when its last task is deleted', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const result = deleteTaskWithLinks([r0], 'BD-1');
    expect(result.containers[0]!.tasks).toEqual([]);
  });

  it('refuses a task in a finished release', () => {
    const archived = finished(task('BD-1', 'done', 100));
    expect(() => deleteTaskWithLinks([archived], 'BD-1')).toThrow(/finished release/);
  });

  it('throws on an unknown task', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    expect(() => deleteTaskWithLinks([r0], 'BD-9')).toThrow(/not found/);
  });
});

describe('changeTaskStatus', () => {
  it('updates status and places task at the end of the container', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'in-progress', 100),
      task('BD-3', 'in-progress', 200),
    );
    const r1 = changeTaskStatus(r0, config, 'BD-1', 'in-progress');
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('in-progress');
    expect(moved.frontmatter.order).toBe(300);
  });
});

describe('reorderTask', () => {
  it('places before given peer with averaged order', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 200),
      task('BD-3', 'todo', 300),
    );
    const r1 = reorderTask(r0, 'BD-3', 'BD-2');
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-3')!;
    expect(moved.frontmatter.order).toBe(150);
  });

  it('places at end when beforeTaskId is null', () => {
    const r0 = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));
    const r1 = reorderTask(r0, 'BD-1', null);
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.order).toBe(300);
  });

  it('renumbers the container on order collision', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 101),
      task('BD-3', 'todo', 200),
    );
    const r1 = reorderTask(r0, 'BD-3', 'BD-2');
    const orders = r1.tasks
      .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
      .map((t) => t.frontmatter.order);
    expect(orders).toEqual([100, 200, 300]);
  });

  it('reorders tasks across different statuses by container order', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'in-progress', 200),
      task('BD-3', 'done', 300),
    );
    // Put BD-1 (todo) right before BD-3 (done) — i.e. between BD-2 and BD-3.
    const r1 = reorderTask(r0, 'BD-1', 'BD-3');
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('todo');
    expect(moved.frontmatter.order).toBe(250);
    const orderedIds = [...r1.tasks]
      .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
      .map((t) => t.frontmatter.id);
    expect(orderedIds).toEqual(['BD-2', 'BD-1', 'BD-3']);
  });
});

describe('createRelease', () => {
  it('stores name and uses it as slug when filename-safe', () => {
    const r = createRelease([], { name: '2.0' });
    expect(r.filename).toBe('releases/2.0.md');
    expect(r.slug).toBe('2.0');
    expect(r.frontmatter.name).toBe('2.0');
    expect(r.frontmatter.status).toBe('future');
    expect(r.frontmatter.description).toBeUndefined();
    expect(r.tasks).toEqual([]);
    expect(r.preamble).toBe('');
  });

  it('lowercases the slug while keeping the name as typed', () => {
    const r = createRelease([], { name: 'Beta Release' });
    expect(r.slug).toBe('beta-release');
    expect(r.frontmatter.name).toBe('Beta Release');
  });

  it('preserves unicode and emoji in slug but replaces spaces with - and lowercases', () => {
    const r = createRelease([], { name: 'Бета релиз 🚀' });
    expect(r.slug).toBe('бета-релиз-🚀');
    expect(r.filename).toBe('releases/бета-релиз-🚀.md');
    expect(r.frontmatter.name).toBe('Бета релиз 🚀');
  });

  it('replaces filesystem-forbidden characters with - in the slug', () => {
    const r = createRelease([], { name: '1.0:Beta/X?' });
    expect(r.slug).toBe('1.0-beta-x');
    expect(r.frontmatter.name).toBe('1.0:Beta/X?');
  });

  it('collapses runs of dashes and trims them at edges', () => {
    expect(createRelease([], { name: 'Foo: bar' }).slug).toBe('foo-bar');
    expect(createRelease([], { name: ':foo:' }).slug).toBe('foo');
    expect(createRelease([], { name: 'a   b' }).slug).toBe('a-b');
  });

  it('stores trimmed description when provided', () => {
    const r = createRelease([], { name: '2.0', description: '  beta  ' });
    expect(r.frontmatter.description).toBe('beta');
  });

  it('omits empty description', () => {
    const r = createRelease([], { name: '2.0', description: '   ' });
    expect(r.frontmatter.description).toBeUndefined();
  });

  it('throws when the slug duplicates an existing release (case-insensitive)', () => {
    const existing = createRelease([], { name: 'Beta' });
    expect(existing.slug).toBe('beta');
    expect(() => createRelease([existing], { name: 'BETA' })).toThrow(
      /already exists/i,
    );
    expect(() => createRelease([existing], { name: 'Beta' })).toThrow(
      /already exists/i,
    );
  });

  it('throws when sanitization leaves the slug empty', () => {
    expect(() => createRelease([], { name: '..' })).toThrow(
      /characters allowed in a filename/i,
    );
    expect(() => createRelease([], { name: '???' })).toThrow(
      /characters allowed in a filename/i,
    );
  });

  it('throws when the name is empty after trimming', () => {
    expect(() => createRelease([], { name: '   ' })).toThrow(/required/i);
  });

  it('suffixes reserved Windows names with underscore', () => {
    const r = createRelease([], { name: 'CON' });
    expect(r.slug).toBe('con_');
    expect(r.filename).toBe('releases/con_.md');
  });
});

describe('createEpic', () => {
  it('stores name and color, derives a filename-safe slug', () => {
    const e = createEpic([], { name: 'Drag & Drop', color: '#f59e0b' });
    expect(e.filename).toBe('epics/drag-&-drop.md');
    expect(e.slug).toBe('drag-&-drop');
    expect(e.frontmatter.name).toBe('Drag & Drop');
    expect(e.frontmatter.color).toBe('#f59e0b');
    expect(e.tasks).toEqual([]);
    expect(e.preamble).toBe('');
  });

  it('lowercases the slug while keeping the name as typed', () => {
    const e = createEpic([], { name: 'UI Foundation', color: '#1f6feb' });
    expect(e.slug).toBe('ui-foundation');
    expect(e.frontmatter.name).toBe('UI Foundation');
  });

  it('stores trimmed description in the preamble', () => {
    const e = createEpic([], {
      name: 'Parser',
      color: '#1f6feb',
      description: '  parsing logic  ',
    });
    expect(e.preamble).toBe('parsing logic');
  });

  it('leaves the preamble empty when no description is given', () => {
    const e = createEpic([], { name: 'Parser', color: '#1f6feb' });
    expect(e.preamble).toBe('');
  });

  it('throws when the slug duplicates an existing epic (case-insensitive)', () => {
    const existing = createEpic([], { name: 'Parser', color: '#1f6feb' });
    expect(() => createEpic([existing], { name: 'PARSER', color: '#1f6feb' })).toThrow(
      /already exists/i,
    );
  });

  it('throws when sanitization leaves the slug empty', () => {
    expect(() => createEpic([], { name: '???', color: '#1f6feb' })).toThrow(
      /characters allowed in a filename/i,
    );
  });

  it('throws when the name is empty after trimming', () => {
    expect(() => createEpic([], { name: '   ', color: '#1f6feb' })).toThrow(
      /required/i,
    );
  });
});

describe('emptyBacklog', () => {
  it('returns an empty backlog at epics/no_epic.md', () => {
    const b = emptyBacklog();
    expect(b.filename).toBe('epics/no_epic.md');
    expect(b.frontmatter).toEqual({});
    expect(b.preamble).toBe('');
    expect(b.tasks).toEqual([]);
  });

  it('accepts a task and serializes to a parseable file', () => {
    const result = createTask(emptyBacklog(), config, {
      title: 'Loose task',
      type: 'feature',
      status: 'todo',
    });
    expect(result.container.tasks).toHaveLength(1);
    const text = serializeBacklog(result.container);
    const parsed = parseBacklog(text, result.container.filename);
    expect(parsed.problems).toEqual([]);
    expect(parsed.value).not.toBeNull();
    expect(parsed.value!.tasks).toHaveLength(1);
    expect(parsed.value!.tasks[0]!.title).toBe('Loose task');
  });
});

describe('moveTaskBetweenContainers', () => {
  it('removes from source, places into dest with new status', () => {
    const a = release(task('BD-1', 'todo', 100));
    a.filename = 'releases/1.10.md';
    const b = release(task('BD-2', 'in-progress', 100));
    b.filename = 'releases/1.11.md';
    const result = moveTaskBetweenContainers(a, b, config, 'BD-1', {
      newStatus: 'in-progress',
      beforeTaskId: null,
    });
    expect(result.source.tasks).toHaveLength(0);
    expect(result.dest.tasks).toHaveLength(2);
    const moved = result.dest.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('in-progress');
    expect(moved.frontmatter.order).toBe(200);
  });

  it('carries priority across the move', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.priority = 'critical';
    const a = release(t);
    a.filename = 'releases/1.10.md';
    const b = release();
    b.filename = 'releases/1.11.md';
    const result = moveTaskBetweenContainers(a, b, config, 'BD-1', {
      newStatus: 'todo',
      beforeTaskId: null,
    });
    expect(result.dest.tasks[0]!.frontmatter.priority).toBe('critical');
  });

  it('preserves task.epic by default (release → release)', () => {
    const a = release({
      title: 'Task',
      description: '',
      frontmatter: { id: 'BD-1', type: 'feature', status: 'todo', epic: 'parser', order: 100 },
    });
    a.filename = 'releases/1.10.md';
    const b = release();
    b.filename = 'releases/1.11.md';
    const result = moveTaskBetweenContainers(a, b, config, 'BD-1', {
      newStatus: 'todo',
      beforeTaskId: null,
    });
    expect(result.dest.tasks[0]!.frontmatter.epic).toBe('parser');
  });

  it('sets task.epic to dest.slug when destEpic is { kind: set }', () => {
    const a = release(task('BD-1', 'todo', 100));
    a.filename = 'releases/1.10.md';
    const b: Epic = {
      filename: 'epics/dnd.md',
      slug: 'dnd',
      frontmatter: { name: 'DnD', color: '#000000' },
      preamble: '',
      tasks: [],
    };
    const result = moveTaskBetweenContainers(a, b, config, 'BD-1', {
      newStatus: 'todo',
      beforeTaskId: null,
      destEpic: { kind: 'set', slug: 'dnd' },
    });
    expect(result.dest.tasks[0]!.frontmatter.epic).toBe('dnd');
  });

  it('clears task.epic when destEpic is { kind: clear }', () => {
    const a: Epic = {
      filename: 'epics/dnd.md',
      slug: 'dnd',
      frontmatter: { name: 'DnD', color: '#000000' },
      preamble: '',
      tasks: [
        {
          title: 'Task',
          description: '',
          frontmatter: { id: 'BD-1', type: 'feature', status: 'todo', epic: 'dnd', order: 100 },
        },
      ],
    };
    const b: Backlog = {
      filename: 'epics/no_epic.md',
      frontmatter: {},
      preamble: '',
      tasks: [],
    };
    const result = moveTaskBetweenContainers(a, b, config, 'BD-1', {
      newStatus: 'todo',
      beforeTaskId: null,
      destEpic: { kind: 'clear' },
    });
    expect(result.dest.tasks[0]!.frontmatter.epic).toBeUndefined();
  });
});

const epic = (slug: string, ...tasks: Task[]): Epic => ({
  filename: `epics/${slug}.md`,
  slug,
  frontmatter: { name: slug, color: '#000000' },
  preamble: '',
  tasks,
});

const backlog = (...tasks: Task[]): Backlog => ({
  filename: 'epics/no_epic.md',
  frontmatter: {},
  preamble: '',
  tasks,
});

const findTaskAnywhere = (
  result: { epics: Epic[]; backlog: Backlog | null },
  id: string,
): Task | undefined => {
  for (const e of result.epics) {
    const t = e.tasks.find((x) => x.frontmatter.id === id);
    if (t) return t;
  }
  return result.backlog?.tasks.find((x) => x.frontmatter.id === id);
};

describe('reorderTaskInBacklog', () => {
  it('moves task within its own epic by changing order only, writes one file', () => {
    const a = epic('a', task('BD-1', 'todo', 100), task('BD-2', 'todo', 200), task('BD-3', 'todo', 300));
    const result = reorderTaskInBacklog({ epics: [a], backlog: null }, 'BD-3', 'BD-2');
    const moved = findTaskAnywhere(result, 'BD-3')!;
    expect(moved.frontmatter.order).toBe(150);
    expect(result.changedFilenames).toEqual(['epics/a.md']);
    expect(result.epics[0]!.tasks).toHaveLength(3);
  });

  it('reorders across epics without touching task.epic or file location', () => {
    const a = epic(
      'a',
      { ...task('BD-1', 'todo', 100), frontmatter: { id: 'BD-1', type: 'feature', status: 'todo', epic: 'a', order: 100 } },
    );
    const b = epic(
      'b',
      { ...task('BD-2', 'todo', 200), frontmatter: { id: 'BD-2', type: 'feature', status: 'todo', epic: 'b', order: 200 } },
      { ...task('BD-3', 'todo', 300), frontmatter: { id: 'BD-3', type: 'feature', status: 'todo', epic: 'b', order: 300 } },
    );
    // Place BD-3 before BD-1 (different epic) -> BD-3 ends up first in the flat list
    const result = reorderTaskInBacklog({ epics: [a, b], backlog: null }, 'BD-3', 'BD-1');
    const moved = findTaskAnywhere(result, 'BD-3')!;
    expect(moved.frontmatter.epic).toBe('b');
    expect(result.epics.find((e) => e.slug === 'b')!.tasks.some((t) => t.frontmatter.id === 'BD-3')).toBe(true);
    expect(result.epics.find((e) => e.slug === 'a')!.tasks.some((t) => t.frontmatter.id === 'BD-3')).toBe(false);
    // BD-3 must have order < 100 (or trigger renumber landing at 100/200/300)
    const all = [
      ...result.epics.flatMap((e) => e.tasks),
    ].sort((x, y) => x.frontmatter.order - y.frontmatter.order);
    expect(all.map((t) => t.frontmatter.id)).toEqual(['BD-3', 'BD-1', 'BD-2']);
  });

  it('places task before a no_epic task while keeping it in its epic file', () => {
    const a = epic('a', task('BD-1', 'todo', 300));
    const bl = backlog(task('BD-2', 'todo', 200));
    // BD-1 starts at 300 (after BD-2). Drop BD-1 before BD-2 — only its order
    // should change, and it must stay in epics/a.md.
    const result = reorderTaskInBacklog({ epics: [a], backlog: bl }, 'BD-1', 'BD-2');
    expect(result.changedFilenames).toEqual(['epics/a.md']);
    expect(result.epics[0]!.tasks[0]!.frontmatter.id).toBe('BD-1');
    expect(result.epics[0]!.tasks[0]!.frontmatter.order).toBe(100);
    expect(result.backlog!.tasks[0]!.frontmatter.id).toBe('BD-2');
  });

  it('places task at the end when beforeTaskId is null', () => {
    const a = epic('a', task('BD-1', 'todo', 100));
    const b = epic('b', task('BD-2', 'todo', 200));
    const result = reorderTaskInBacklog({ epics: [a, b], backlog: null }, 'BD-1', null);
    const moved = findTaskAnywhere(result, 'BD-1')!;
    expect(moved.frontmatter.order).toBe(300);
  });

  it('triggers global renumber on collision; touches all affected files', () => {
    const a = epic('a', task('BD-1', 'todo', 100), task('BD-2', 'todo', 101));
    const b = epic('b', task('BD-3', 'todo', 50));
    // BD-1 / BD-2 are adjacent integers — no room to insert between them, must renumber.
    const result = reorderTaskInBacklog({ epics: [a, b], backlog: null }, 'BD-3', 'BD-2');
    const all = [...result.epics.flatMap((e) => e.tasks)].sort(
      (x, y) => x.frontmatter.order - y.frontmatter.order,
    );
    expect(all.map((t) => t.frontmatter.order)).toEqual([100, 200, 300]);
    expect(all.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-3', 'BD-2']);
    expect(new Set(result.changedFilenames)).toEqual(new Set(['epics/a.md', 'epics/b.md']));
  });

  it('throws when task is not in any backlog container', () => {
    const a = epic('a', task('BD-1', 'todo', 100));
    expect(() =>
      reorderTaskInBacklog({ epics: [a], backlog: null }, 'BD-999', null),
    ).toThrow(/Task not found in backlog/);
  });
});

const epicTask = (
  id: string,
  status: TaskStatus,
  order: number,
  epicSlug: string,
): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status, epic: epicSlug, order },
});

describe('completeRelease', () => {
  it('moves unfinished tasks to a target release and finishes the source', () => {
    const source = release(
      task('BD-1', 'done', 100),
      task('BD-2', 'todo', 200),
      task('BD-3', 'in-progress', 300),
    );
    const targetRelease: Release = {
      filename: 'releases/2.0.md',
      slug: '2.0',
      frontmatter: { status: 'future' },
      preamble: '',
      tasks: [],
    };

    const result = completeRelease({
      config,
      release: source,
      epics: [],
      backlog: null,
      targetRelease,
    });

    expect(result.release.frontmatter.status).toBe('finished');
    expect(result.release.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
    expect(result.targetRelease!.tasks.map((t) => t.frontmatter.id)).toEqual([
      'BD-2',
      'BD-3',
    ]);
    // statuses are preserved when moving to a release
    expect(
      result.targetRelease!.tasks.find((t) => t.frontmatter.id === 'BD-3')!
        .frontmatter.status,
    ).toBe('in-progress');
    expect(new Set(result.changedFilenames)).toEqual(
      new Set(['releases/1.10.md', 'releases/2.0.md']),
    );
  });

  it('moves unfinished tasks to backlog, preserving their epic', () => {
    const source = release(
      task('BD-1', 'done', 100),
      epicTask('BD-2', 'todo', 200, 'a'),
      task('BD-3', 'todo', 300),
    );
    const a = epic('a');
    const bl = backlog();

    const result = completeRelease({
      config,
      release: source,
      epics: [a],
      backlog: bl,
      targetRelease: null,
    });

    expect(result.release.frontmatter.status).toBe('finished');
    expect(result.release.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1']);
    // BD-2 had an epic -> goes back to that epic file
    expect(result.epics[0]!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-2']);
    expect(result.epics[0]!.tasks[0]!.frontmatter.epic).toBe('a');
    // BD-3 had no epic -> goes to the backlog with the epic field cleared
    expect(result.backlog!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-3']);
    expect(result.backlog!.tasks[0]!.frontmatter.epic).toBeUndefined();
    expect(new Set(result.changedFilenames)).toEqual(
      new Set(['releases/1.10.md', 'epics/a.md', 'epics/no_epic.md']),
    );
  });

  it('only finishes the release when every task is done', () => {
    const source = release(task('BD-1', 'done', 100), task('BD-2', 'done', 200));

    const result = completeRelease({
      config,
      release: source,
      epics: [],
      backlog: null,
      targetRelease: null,
    });

    expect(result.release.frontmatter.status).toBe('finished');
    expect(result.release.tasks).toHaveLength(2);
    expect(result.changedFilenames).toEqual(['releases/1.10.md']);
  });

  it('throws when an unfinished task without epic has no backlog to fall back to', () => {
    const source = release(task('BD-1', 'todo', 100));
    expect(() =>
      completeRelease({
        config,
        release: source,
        epics: [],
        backlog: null,
        targetRelease: null,
      }),
    ).toThrow(/Backlog container is missing/);
  });
});

const futureRelease = (slug: string): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status: 'future', name: slug },
  preamble: '',
  tasks: [],
});

describe('startRelease', () => {
  it('promotes a future release to current', () => {
    const r1 = futureRelease('1.0');
    const r2 = futureRelease('2.0');
    const started = startRelease(r1, [r1, r2]);
    expect(started.frontmatter.status).toBe('current');
  });

  it('throws when another release is already current', () => {
    const r1 = futureRelease('1.0');
    const active: Release = { ...futureRelease('0.9'), frontmatter: { status: 'current', name: '0.9' } };
    expect(() => startRelease(r1, [active, r1])).toThrow(/already current/);
  });
});

describe('process invariants — finished release is archived', () => {
  const finished = (...tasks: Task[]): Release => ({
    ...release(...tasks),
    filename: 'releases/done.md',
    slug: 'done',
    frontmatter: { status: 'finished' },
  });

  it('startRelease rejects a non-future release', () => {
    expect(() => startRelease(finished(), [])).toThrow(/future/);
    expect(() => startRelease(release(), [])).toThrow(/future/);
  });

  it('completeRelease rejects a non-current release', () => {
    expect(() =>
      completeRelease({
        config,
        release: futureRelease('next'),
        epics: [],
        backlog: null,
        targetRelease: null,
      }),
    ).toThrow(/current/);
  });

  it('createTask rejects a finished release', () => {
    expect(() =>
      createTask(finished(), config, { title: 'x', type: 'feature', status: 'todo' }),
    ).toThrow(/finished/);
  });

  it('task mutations reject a finished release', () => {
    const r = finished(task('BD-1', 'todo', 100));
    expect(() => editTask(r, config, 'BD-1', { title: 'y' })).toThrow(/finished/);
    expect(() => changeTaskStatus(r, config, 'BD-1', 'done')).toThrow(/finished/);
    expect(() => deleteTask(r, 'BD-1')).toThrow(/finished/);
    expect(() => reorderTask(r, 'BD-1', null)).toThrow(/finished/);
  });

  it('moveTaskBetweenContainers rejects a finished source or destination', () => {
    expect(() =>
      moveTaskBetweenContainers(finished(task('BD-1', 'todo', 100)), release(), config, 'BD-1', {
        newStatus: 'todo',
        beforeTaskId: null,
      }),
    ).toThrow(/out of a finished/);
    expect(() =>
      moveTaskBetweenContainers(release(task('BD-2', 'todo', 100)), finished(), config, 'BD-2', {
        newStatus: 'todo',
        beforeTaskId: null,
      }),
    ).toThrow(/into a finished/);
  });
});

describe('process invariants — a status only changes in the current release', () => {
  const withTasks = <C extends Release | Epic | Backlog>(container: C, ...tasks: Task[]): C => ({
    ...container,
    tasks,
  });
  const epic = (...tasks: Task[]): Epic =>
    withTasks<Epic>(
      {
        filename: 'epics/dnd.md',
        slug: 'dnd',
        frontmatter: { name: 'DnD', color: '#000000' },
        preamble: '',
        tasks: [],
      },
      ...tasks,
    );
  const backlog = (...tasks: Task[]): Backlog => withTasks(emptyBacklog(), ...tasks);
  const finished = (...tasks: Task[]): Release =>
    withTasks<Release>(
      { ...release(), filename: 'releases/done.md', slug: 'done', frontmatter: { status: 'finished' } },
      ...tasks,
    );

  it('changeTaskStatus succeeds in the current release', () => {
    const r = changeTaskStatus(release(task('BD-1', 'todo', 100)), config, 'BD-1', 'done');
    expect(r.tasks[0]!.frontmatter.status).toBe('done');
  });

  it('changeTaskStatus is refused in a future release, an epic and the backlog', () => {
    const t = task('BD-1', 'todo', 100);
    for (const container of [withTasks(futureRelease('next'), t), epic(t), backlog(t)]) {
      expect(() => changeTaskStatus(container, config, 'BD-1', 'done')).toThrow(
        /can only be changed in the current release/,
      );
    }
  });

  it('carries the STATUS_LOCKED code and names the container', () => {
    try {
      changeTaskStatus(withTasks(futureRelease('next'), task('BD-1', 'todo', 100)), config, 'BD-1', 'done');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BoardOpError);
      expect((err as BoardOpError).code).toBe('STATUS_LOCKED');
      expect((err as BoardOpError).message).toContain('BD-1');
      expect((err as BoardOpError).message).toContain('the future release "next"');
    }
  });

  it('names an epic and the backlog in the refusal', () => {
    const t = task('BD-1', 'todo', 100);
    expect(() => changeTaskStatus(epic(t), config, 'BD-1', 'done')).toThrow(/the epic "DnD"/);
    expect(() => changeTaskStatus(backlog(t), config, 'BD-1', 'done')).toThrow(/the backlog/);
  });

  it('refuses a status write that changes nothing, so the rule stays predictable', () => {
    const r = withTasks(futureRelease('next'), task('BD-1', 'todo', 100));
    expect(() => changeTaskStatus(r, config, 'BD-1', 'todo')).toThrow(/STATUS_LOCKED|current release/);
    expect(() => editTask(r, config, 'BD-1', { status: 'todo' })).toThrow(/current release/);
  });

  it('keeps the archive rule ahead of the lock in a finished release', () => {
    const r = finished(task('BD-1', 'todo', 100));
    try {
      changeTaskStatus(r, config, 'BD-1', 'done');
      expect.unreachable();
    } catch (err) {
      expect((err as BoardOpError).code).toBe('ARCHIVED');
    }
  });

  it('editTask refuses a status patch outside the current release but allows the rest', () => {
    const r = withTasks(futureRelease('next'), task('BD-1', 'todo', 100));
    expect(() => editTask(r, config, 'BD-1', { status: 'done' })).toThrow(
      /can only be changed in the current release/,
    );
    const edited = editTask(r, config, 'BD-1', { title: 'Renamed', type: 'bug' });
    expect(edited.tasks[0]!.title).toBe('Renamed');
    expect(edited.tasks[0]!.frontmatter.type).toBe('bug');
    expect(edited.tasks[0]!.frontmatter.status).toBe('todo');
  });

  it('createTask refuses a non-todo status outside the current release, keeping nextId', () => {
    const r = futureRelease('next');
    expect(() =>
      createTask(r, config, { title: 'x', type: 'feature', status: 'in-progress' }),
    ).toThrow(/can only be changed in the current release/);
    expect(config.nextId).toBe(10);
    const created = createTask(r, config, { title: 'x', type: 'feature', status: 'todo' });
    expect(created.task.frontmatter.status).toBe('todo');
    expect(created.config.nextId).toBe(11);
  });

  it('moveTaskBetweenContainers preserves a status into a locked destination', () => {
    const source = release(task('BD-1', 'in-progress', 100));
    const result = moveTaskBetweenContainers(source, futureRelease('next'), config, 'BD-1', {
      newStatus: 'in-progress',
      beforeTaskId: null,
    });
    expect(result.dest.tasks[0]!.frontmatter.status).toBe('in-progress');
  });

  it('moveTaskBetweenContainers refuses a status change into a locked destination', () => {
    const source = release(task('BD-1', 'in-progress', 100));
    expect(() =>
      moveTaskBetweenContainers(source, futureRelease('next'), config, 'BD-1', {
        newStatus: 'done',
        beforeTaskId: null,
      }),
    ).toThrow(/can only be changed in the current release/);
  });

  it('moveTaskBetweenContainers allows a status change into the current release', () => {
    const source = withTasks(futureRelease('next'), task('BD-1', 'todo', 100));
    const result = moveTaskBetweenContainers(source, release(), config, 'BD-1', {
      newStatus: 'in-progress',
      beforeTaskId: null,
    });
    expect(result.dest.tasks[0]!.frontmatter.status).toBe('in-progress');
  });

  it('moveTaskInContainer allows a pure reorder in a locked container', () => {
    const r = withTasks(
      futureRelease('next'),
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 200),
    );
    const moved = moveTaskInContainer(r, config, 'BD-2', { status: 'todo', beforeTaskId: 'BD-1' });
    const orderOf = (id: string): number =>
      moved.tasks.find((t) => t.frontmatter.id === id)!.frontmatter.order;
    expect(orderOf('BD-2')).toBeLessThan(orderOf('BD-1'));
    expect(() =>
      moveTaskInContainer(r, config, 'BD-1', { status: 'done', beforeTaskId: null }),
    ).toThrow(/can only be changed in the current release/);
  });

  describe('WIP limit on the current release In Progress column', () => {
    const limited = (limit: number): BoardConfig => ({
      ...config,
      wipLimits: { 'in-progress': limit },
    });
    const full = (): Release =>
      release(
        task('BD-1', 'in-progress', 100),
        task('BD-2', 'in-progress', 200),
        task('BD-3', 'todo', 300),
        task('BD-4', 'done', 400),
      );

    it('reports the count and the limit only for a current release', () => {
      expect(inProgressCount(full())).toBe(2);
      expect(wipLimitFor(full(), limited(2))).toBe(2);
      expect(wipLimitFor(full(), config)).toBeNull();
      expect(wipLimitFor(withTasks(futureRelease('next'), task('BD-1', 'in-progress', 100)), limited(1))).toBeNull();
      expect(isWipLimitReached(full(), limited(2))).toBe(true);
      expect(isWipLimitReached(full(), limited(3))).toBe(false);
    });

    it('refuses a status change into a full column, with the WIP_LIMIT code', () => {
      try {
        changeTaskStatus(full(), limited(2), 'BD-3', 'in-progress');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(BoardOpError);
        expect((err as BoardOpError).code).toBe('WIP_LIMIT');
        expect((err as BoardOpError).message).toContain('2 tasks in progress');
        expect((err as BoardOpError).message).toContain('WIP limit is 2');
      }
    });

    it('allows the same change with no limit configured or with room left', () => {
      expect(() => changeTaskStatus(full(), config, 'BD-3', 'in-progress')).not.toThrow();
      expect(() => changeTaskStatus(full(), limited(3), 'BD-3', 'in-progress')).not.toThrow();
    });

    it('never blocks leaving the column, nor a no-op on a task already there', () => {
      expect(() => changeTaskStatus(full(), limited(2), 'BD-1', 'done')).not.toThrow();
      expect(() => changeTaskStatus(full(), limited(2), 'BD-1', 'in-progress')).not.toThrow();
    });

    it('allows a reorder inside the full column but refuses a move into it', () => {
      expect(() =>
        moveTaskInContainer(full(), limited(2), 'BD-2', {
          status: 'in-progress',
          beforeTaskId: 'BD-1',
        }),
      ).not.toThrow();
      expect(() =>
        moveTaskInContainer(full(), limited(2), 'BD-3', {
          status: 'in-progress',
          beforeTaskId: null,
        }),
      ).toThrow(/WIP limit/);
    });

    it('tolerates a board already over its limit and still blocks new entries', () => {
      const over = release(
        task('BD-1', 'in-progress', 100),
        task('BD-2', 'in-progress', 200),
        task('BD-3', 'in-progress', 300),
        task('BD-4', 'todo', 400),
      );
      expect(() => changeTaskStatus(over, limited(2), 'BD-1', 'done')).not.toThrow();
      expect(() => changeTaskStatus(over, limited(2), 'BD-4', 'in-progress')).toThrow(/WIP limit/);
    });

    it('refuses an in-progress task relocated into a full current release', () => {
      const source = withTasks(futureRelease('next'), task('BD-9', 'in-progress', 100));
      expect(() =>
        moveTaskBetweenContainers(source, full(), limited(2), 'BD-9', {
          newStatus: 'in-progress',
          beforeTaskId: null,
        }),
      ).toThrow(/WIP limit/);
      // A `todo` task is unaffected, and so is a move *out* of the full release.
      const todoSource = withTasks(futureRelease('next'), task('BD-8', 'todo', 100));
      expect(() =>
        moveTaskBetweenContainers(todoSource, full(), limited(2), 'BD-8', {
          newStatus: 'todo',
          beforeTaskId: null,
        }),
      ).not.toThrow();
      expect(() =>
        moveTaskBetweenContainers(full(), futureRelease('next'), limited(2), 'BD-1', {
          newStatus: 'in-progress',
          beforeTaskId: null,
        }),
      ).not.toThrow();
    });

    it('refuses editTask and createTask that land on in-progress in a full column', () => {
      expect(() => editTask(full(), limited(2), 'BD-3', { status: 'in-progress' })).toThrow(
        /WIP limit/,
      );
      expect(() => editTask(full(), limited(2), 'BD-3', { title: 'X' })).not.toThrow();
      expect(() =>
        createTask(full(), limited(2), { title: 'N', type: 'feature', status: 'in-progress' }),
      ).toThrow(/WIP limit/);
      expect(() =>
        createTask(full(), limited(2), { title: 'N', type: 'feature', status: 'todo' }),
      ).not.toThrow();
    });

    it('keeps ARCHIVED and STATUS_LOCKED ahead of the WIP limit', () => {
      const archived = finished(task('BD-1', 'todo', 100));
      try {
        changeTaskStatus(archived, limited(1), 'BD-1', 'in-progress');
        expect.unreachable();
      } catch (err) {
        expect((err as BoardOpError).code).toBe('ARCHIVED');
      }
      const future = withTasks(futureRelease('next'), task('BD-1', 'todo', 100));
      try {
        changeTaskStatus(future, limited(1), 'BD-1', 'in-progress');
        expect.unreachable();
      } catch (err) {
        expect((err as BoardOpError).code).toBe('STATUS_LOCKED');
      }
    });

    it('completing a release is unaffected — it only moves tasks out', () => {
      expect(() =>
        completeRelease({
          release: full(),
          config: limited(1),
          epics: [],
          backlog: backlog(),
          targetRelease: null,
        }),
      ).not.toThrow();
    });
  });

  it('reorderTask and reorderTaskInBacklog stay allowed in a locked container', () => {
    const r = withTasks(
      futureRelease('next'),
      task('BD-1', 'in-progress', 100),
      task('BD-2', 'todo', 200),
    );
    expect(() => reorderTask(r, 'BD-2', 'BD-1')).not.toThrow();
    const b = backlog(task('BD-3', 'done', 100), task('BD-4', 'todo', 200));
    expect(() =>
      reorderTaskInBacklog({ epics: [], backlog: b }, 'BD-4', 'BD-3'),
    ).not.toThrow();
  });

  it('completeRelease still carries an unfinished leftover with its status', () => {
    const current = release(task('BD-1', 'in-progress', 100), task('BD-2', 'done', 200));
    const result = completeRelease({
      config,
      release: current,
      epics: [],
      backlog: null,
      targetRelease: futureRelease('next'),
    });
    expect(result.release.frontmatter.status).toBe('finished');
    expect(result.release.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-2']);
    expect(result.targetRelease!.tasks[0]!.frontmatter.status).toBe('in-progress');
  });
});

describe('task links', () => {
  const backlogWith = (...tasks: Task[]): Backlog => ({
    ...emptyBacklog(),
    tasks,
  });

  const archived = (...tasks: Task[]): Release => ({
    ...release(...tasks),
    filename: 'releases/done.md',
    slug: 'done',
    frontmatter: { status: 'finished' },
  });

  const linksOf = (container: Release | Backlog | Epic, id: string) =>
    container.tasks.find((t) => t.frontmatter.id === id)?.frontmatter.links;

  it('mirrors the link into both containers and reports both files', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));

    const result = addTaskLink(r, b, 'BD-1', 'BD-2', 'relates');

    expect(linksOf(result.source, 'BD-1')).toEqual([{ type: 'relates', to: 'BD-2' }]);
    expect(linksOf(result.target, 'BD-2')).toEqual([{ type: 'relates', to: 'BD-1' }]);
    expect(result.changedFilenames).toEqual([r.filename, b.filename]);
  });

  it('writes both records when the tasks share one container', () => {
    const r = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));

    const result = addTaskLink(r, r, 'BD-1', 'BD-2', 'relates');

    expect(linksOf(result.source, 'BD-1')).toEqual([{ type: 'relates', to: 'BD-2' }]);
    expect(linksOf(result.source, 'BD-2')).toEqual([{ type: 'relates', to: 'BD-1' }]);
    expect(result.changedFilenames).toEqual([r.filename]);
    expect(result.target).toBe(result.source);
  });

  it('is idempotent: re-adding changes nothing and reports no files', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));
    const first = addTaskLink(r, b, 'BD-1', 'BD-2', 'relates');

    const second = addTaskLink(first.source, first.target, 'BD-1', 'BD-2', 'relates');

    expect(second.changedFilenames).toEqual([]);
    expect(linksOf(second.source, 'BD-1')).toHaveLength(1);
    expect(linksOf(second.target, 'BD-2')).toHaveLength(1);
  });

  it('removes both records', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));
    const linked = addTaskLink(r, b, 'BD-1', 'BD-2', 'relates');

    const result = removeTaskLink(linked.source, linked.target, 'BD-1', 'BD-2', 'relates');

    expect(linksOf(result.source, 'BD-1')).toBeUndefined();
    expect(linksOf(result.target, 'BD-2')).toBeUndefined();
    expect(result.changedFilenames).toEqual([r.filename, b.filename]);
  });

  it('removes a half-written link and only rewrites the file that held it', () => {
    const half = task('BD-1', 'todo', 100);
    half.frontmatter.links = [{ type: 'relates', to: 'BD-2' }];
    const r = release(half);
    const b = backlogWith(task('BD-2', 'todo', 100));

    const result = removeTaskLink(r, b, 'BD-1', 'BD-2', 'relates');

    expect(linksOf(result.source, 'BD-1')).toBeUndefined();
    expect(result.changedFilenames).toEqual([r.filename]);
  });

  it('removing a link that does not exist is a no-op', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));

    const result = removeTaskLink(r, b, 'BD-1', 'BD-2', 'relates');

    expect(result.changedFilenames).toEqual([]);
  });

  it('rejects linking a task to itself', () => {
    const r = release(task('BD-1', 'todo', 100));
    expect(() => addTaskLink(r, r, 'BD-1', 'BD-1', 'relates')).toThrow(/itself/);
    expect(() => removeTaskLink(r, r, 'BD-1', 'BD-1', 'relates')).toThrow(/itself/);
  });

  it('rejects an unknown task on either side', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));
    expect(() => addTaskLink(r, b, 'BD-9', 'BD-2', 'relates')).toThrow(/BD-9/);
    expect(() => addTaskLink(r, b, 'BD-1', 'BD-9', 'relates')).toThrow(/BD-9/);
  });

  it('rejects a finished release on either side, for add and remove', () => {
    const r = release(task('BD-1', 'todo', 100));
    const a = archived(task('BD-2', 'done', 100));

    expect(() => addTaskLink(a, r, 'BD-2', 'BD-1', 'relates')).toThrow(/finished/);
    expect(() => addTaskLink(r, a, 'BD-1', 'BD-2', 'relates')).toThrow(/finished/);
    expect(() => removeTaskLink(a, r, 'BD-2', 'BD-1', 'relates')).toThrow(/finished/);
    expect(() => removeTaskLink(r, a, 'BD-1', 'BD-2', 'relates')).toThrow(/finished/);
  });

  it('mirrors a directed relation as its inverse on the other task', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));

    const result = addTaskLink(r, b, 'BD-1', 'BD-2', 'blocks');

    expect(linksOf(result.source, 'BD-1')).toEqual([{ type: 'blocks', to: 'BD-2' }]);
    expect(linksOf(result.target, 'BD-2')).toEqual([{ type: 'blocked-by', to: 'BD-1' }]);
  });

  it('mirrors a directed relation when both tasks share one container', () => {
    const r = release(task('BD-1', 'todo', 100), task('BD-2', 'todo', 200));

    const result = addTaskLink(r, r, 'BD-1', 'BD-2', 'includes');

    expect(linksOf(result.source, 'BD-1')).toEqual([{ type: 'includes', to: 'BD-2' }]);
    expect(linksOf(result.source, 'BD-2')).toEqual([{ type: 'part-of', to: 'BD-1' }]);
    expect(result.changedFilenames).toEqual([r.filename]);
  });

  it('lets one pair carry several relations at once', () => {
    const r = release(task('BD-1', 'todo', 100));
    const b = backlogWith(task('BD-2', 'todo', 100));

    const first = addTaskLink(r, b, 'BD-1', 'BD-2', 'blocks');
    const second = addTaskLink(first.source, first.target, 'BD-1', 'BD-2', 'duplicates');

    expect(linksOf(second.source, 'BD-1')).toEqual([
      { type: 'blocks', to: 'BD-2' },
      { type: 'duplicates', to: 'BD-2' },
    ]);
    expect(linksOf(second.target, 'BD-2')).toEqual([
      { type: 'blocked-by', to: 'BD-1' },
      { type: 'duplicated-by', to: 'BD-1' },
    ]);
  });


  it('refuses a finished release for removeAllTaskLinks too', () => {
    const r = release(task('BD-1', 'todo', 100));
    const a = archived(task('BD-2', 'done', 100));

    expect(() => removeAllTaskLinks(r, a, 'BD-1', 'BD-2')).toThrow(/finished/);
    expect(() => removeAllTaskLinks(a, r, 'BD-2', 'BD-1')).toThrow(/finished/);
  });

  it('refuses removeAllTaskLinks on a task pointed at itself', () => {
    const r = release(task('BD-1', 'todo', 100));
    expect(() => removeAllTaskLinks(r, r, 'BD-1', 'BD-1')).toThrow(/itself/);
  });
});

// The array's order is the order of the task blocks in the markdown file, so a
// write that reshuffles it moves whole sections around and turns a status change
// into a conflict-prone diff. These pin the array down.
describe('block order in the file', () => {
  const ids = (tasks: Task[]): string[] => tasks.map((t) => t.frontmatter.id);
  const orderOf = (tasks: Task[], id: string): number =>
    tasks.find((t) => t.frontmatter.id === id)!.frontmatter.order;

  // Physically shuffled, the way a file looks after a few edits.
  const shuffled = (): Release =>
    release(
      task('BD-3', 'todo', 300),
      task('BD-1', 'todo', 100),
      task('BD-2', 'done', 200),
    );

  it('survives a status change', () => {
    const result = changeTaskStatus(shuffled(), config, 'BD-1', 'done');
    expect(ids(result.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2']);
    expect(orderOf(result.tasks, 'BD-1')).toBe(400);
    expect(orderOf(result.tasks, 'BD-2')).toBe(200);
    expect(orderOf(result.tasks, 'BD-3')).toBe(300);
  });

  it('survives a status change made through editTask', () => {
    const result = editTask(shuffled(), config, 'BD-1', { status: 'in-progress' });
    expect(ids(result.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2']);
    expect(orderOf(result.tasks, 'BD-1')).toBe(400);
  });

  it('survives a reorder', () => {
    const result = reorderTask(shuffled(), 'BD-3', 'BD-2');
    expect(ids(result.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2']);
    expect(orderOf(result.tasks, 'BD-3')).toBe(150);
  });

  it('survives a renumber, which rewrites every order in place', () => {
    const tight = release(
      task('BD-3', 'todo', 300),
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 101),
    );
    const result = reorderTask(tight, 'BD-3', 'BD-2');

    expect(ids(result.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2']);
    // Visual order is BD-1, BD-3, BD-2 — the values say so, the array does not.
    expect(orderOf(result.tasks, 'BD-1')).toBe(100);
    expect(orderOf(result.tasks, 'BD-3')).toBe(200);
    expect(orderOf(result.tasks, 'BD-2')).toBe(300);
  });

  it('appends a task moved in from another container', () => {
    const dest = shuffled();
    const source = epic('ui', task('BD-9', 'todo', 100));
    const result = moveTaskBetweenContainers(source, dest, config, 'BD-9', {
      newStatus: 'todo',
      beforeTaskId: null,
    });

    expect(ids(result.dest.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2', 'BD-9']);
    expect(orderOf(result.dest.tasks, 'BD-9')).toBe(400);
    expect(ids(result.source.tasks)).toEqual([]);
  });

  it('appends a created task', () => {
    const result = createTask(shuffled(), config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
    });
    expect(ids(result.container.tasks)).toEqual(['BD-3', 'BD-1', 'BD-2', 'BD-10']);
  });

  it('leaves its neighbours in place when a task is deleted', () => {
    const result = deleteTask(shuffled(), 'BD-1');
    expect(ids(result.tasks)).toEqual(['BD-3', 'BD-2']);
    expect(orderOf(result.tasks, 'BD-2')).toBe(200);
    expect(orderOf(result.tasks, 'BD-3')).toBe(300);
  });
});

describe('custom field values', () => {
  const withFields: BoardConfig = {
    ...config,
    customFields: [
      { key: 'reporter', label: 'Reporter', type: 'string' },
      { key: 'env', type: 'string' },
    ],
  };

  const customOf = (r: Release): Record<string, string> | undefined =>
    r.tasks[0]?.frontmatter.custom;

  it('sets a value', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: 'alice' } });
    expect(customOf(r1)).toEqual({ reporter: 'alice' });
  });

  it('leaves keys the patch does not mention alone', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: 'alice', env: 'prod' } });
    const r2 = editTask(r1, withFields, 'BD-1', { custom: { env: 'staging' } });
    expect(customOf(r2)).toEqual({ reporter: 'alice', env: 'staging' });
  });

  it('rebuilds the bag in declaration order whatever order edits arrive in', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { env: 'staging' } });
    const r2 = editTask(r1, withFields, 'BD-1', { custom: { reporter: 'alice' } });
    expect(Object.keys(customOf(r2) ?? {})).toEqual(['reporter', 'env']);
  });

  it('clears a key on an empty or whitespace-only value', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: 'alice', env: 'prod' } });
    const r2 = editTask(r1, withFields, 'BD-1', { custom: { reporter: '   ' } });
    expect(customOf(r2)).toEqual({ env: 'prod' });
  });

  it('drops the bag entirely when the last value is cleared', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: 'alice' } });
    const r2 = editTask(r1, withFields, 'BD-1', { custom: { reporter: '' } });
    expect(customOf(r2)).toBeUndefined();
    expect('custom' in (r2.tasks[0]?.frontmatter ?? {})).toBe(false);
  });

  it('trims a stored value', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: '  alice  ' } });
    expect(customOf(r1)).toEqual({ reporter: 'alice' });
  });

  it('drops values whose field the config no longer declares', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, withFields, 'BD-1', { custom: { reporter: 'alice', env: 'prod' } });
    const narrowed: BoardConfig = { ...config, customFields: [{ key: 'env', type: 'string' }] };
    const r2 = editTask(r1, narrowed, 'BD-1', { title: 'Renamed' });
    expect(customOf(r2)).toEqual({ env: 'prod' });
  });

  it('seeds values on creation', () => {
    const result = createTask(release(), withFields, {
      title: 'New',
      type: 'feature',
      status: 'todo',
      custom: { env: 'prod' },
    });
    expect(result.task.frontmatter.custom).toEqual({ env: 'prod' });
  });

  it('refuses a task in a finished release', () => {
    const r: Release = {
      ...release(task('BD-1', 'todo', 100)),
      frontmatter: { status: 'finished' },
    };
    expect(() => editTask(r, withFields, 'BD-1', { custom: { env: 'x' } })).toThrow(/finished/);
  });
});
