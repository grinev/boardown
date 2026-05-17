import { describe, expect, it } from 'vitest';
import {
  changeTaskStatus,
  createRelease,
  createTask,
  deleteTask,
  editEpic,
  editTask,
  moveTaskBetweenContainers,
  reorderTask,
} from './board-ops.js';
import type { BoardConfig, Epic, Release, Task, TaskStatus } from './schemas.js';

const config: BoardConfig = {
  idPrefix: 'BD',
  nextId: 10,
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

  it('starts column from 100 when empty', () => {
    const r0 = release(task('BD-1', 'todo', 500));
    const result = createTask(r0, config, {
      title: 'X',
      type: 'tech',
      status: 'in-progress',
    });
    expect(result.task.frontmatter.order).toBe(100);
    expect(result.task.frontmatter.type).toBe('tech');
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

  it('changes status and places task at end of new column', () => {
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
  it('moves task to end of new status column', () => {
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

  it('renumbers the column on order collision', () => {
    const r0 = release(
      task('BD-1', 'todo', 100),
      task('BD-2', 'todo', 101),
      task('BD-3', 'todo', 200),
    );
    const r1 = reorderTask(r0, 'BD-3', 'BD-2');
    const orders = r1.tasks
      .filter((t) => t.frontmatter.status === 'todo')
      .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
      .map((t) => t.frontmatter.order);
    expect(orders).toEqual([100, 200, 300]);
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
});
