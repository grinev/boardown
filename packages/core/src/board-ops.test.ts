import { describe, expect, it } from 'vitest';
import {
  changeTaskStatus,
  completeRelease,
  createEpic,
  createRelease,
  startRelease,
  createTask,
  deleteTask,
  editEpic,
  editTask,
  emptyBacklog,
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
    const r1 = editTask(r0, 'BD-1', { title: 'Updated', description: 'desc' });
    expect(r1.tasks[0]!.title).toBe('Updated');
    expect(r1.tasks[0]!.description).toBe('desc');
    expect(r1.tasks[0]!.frontmatter.order).toBe(100);
  });

  it('clears epic with null', () => {
    const t = task('BD-1', 'todo', 100);
    t.frontmatter.epic = 'parser';
    const r0 = release(t);
    const r1 = editTask(r0, 'BD-1', { epic: null });
    expect(r1.tasks[0]!.frontmatter.epic).toBeUndefined();
  });

  it('updates type', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, 'BD-1', { type: 'bug' });
    expect(r1.tasks[0]!.frontmatter.type).toBe('bug');
  });

  it('changes status and places task at the end of the container', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'done', 100),
      task('BD-3', 'done', 200),
    );
    const r1 = editTask(r0, 'BD-1', { status: 'done' });
    const moved = r1.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('done');
    expect(moved.frontmatter.order).toBe(300);
  });

  it('keeps order untouched when status patch matches current status', () => {
    const r0 = release(task('BD-1', 'todo', 100));
    const r1 = editTask(r0, 'BD-1', { status: 'todo', title: 'Same column' });
    expect(r1.tasks[0]!.frontmatter.order).toBe(100);
    expect(r1.tasks[0]!.title).toBe('Same column');
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

  it('empty patch returns equivalent epic', () => {
    const e = editEpic(baseEpic(), {});
    expect(e.frontmatter.name).toBe('Parser');
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

describe('changeTaskStatus', () => {
  it('updates status and places task at the end of the container', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'in-progress', 100),
      task('BD-3', 'in-progress', 200),
    );
    const r1 = changeTaskStatus(r0, 'BD-1', 'in-progress');
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
    const result = moveTaskBetweenContainers(a, b, 'BD-1', {
      newStatus: 'in-progress',
      beforeTaskId: null,
    });
    expect(result.source.tasks).toHaveLength(0);
    expect(result.dest.tasks).toHaveLength(2);
    const moved = result.dest.tasks.find((t) => t.frontmatter.id === 'BD-1')!;
    expect(moved.frontmatter.status).toBe('in-progress');
    expect(moved.frontmatter.order).toBe(200);
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
    const result = moveTaskBetweenContainers(a, b, 'BD-1', {
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
    const result = moveTaskBetweenContainers(a, b, 'BD-1', {
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
    const result = moveTaskBetweenContainers(a, b, 'BD-1', {
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
