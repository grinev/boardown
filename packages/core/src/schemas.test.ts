import { describe, expect, it } from 'vitest';
import {
  BoardConfigSchema,
  EpicFrontmatterSchema,
  ReleaseFrontmatterSchema,
  TaskFrontmatterSchema,
} from './schemas.js';

describe('TaskFrontmatterSchema', () => {
  it('accepts a minimal valid frontmatter', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional epic', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-2',
      type: 'tech',
      status: 'in-progress',
      epic: 'ui-foundation',
      order: 200,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when order is not an integer', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required fields are missing', () => {
    const result = TaskFrontmatterSchema.safeParse({ status: 'todo', order: 100 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'wip',
      order: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown type', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'epic',
      status: 'todo',
      order: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when type is missing', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      status: 'todo',
      order: 100,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional checklist of items', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      checklist: [
        { id: 'c1', text: 'First', done: true },
        { id: 'c2', text: 'Second', done: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a checklist item with a non-boolean done', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      checklist: [{ id: 'c1', text: 'First', done: 'yes' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a checklist item with empty text', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      checklist: [{ id: 'c1', text: '', done: false }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional list of notes', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      notes: [
        { id: 'n1', text: 'First note', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'n2', text: 'Second note', createdAt: '2026-01-02T12:30:00.000Z' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('coerces a Date createdAt back to an ISO string', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      notes: [{ id: 'n1', text: 'Note', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes?.[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    }
  });

  it('rejects a note with empty text', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      notes: [{ id: 'n1', text: '', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional list of links', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      links: [{ type: 'relates', to: 'BD-2' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a link with an unknown type or a missing target', () => {
    const badType = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      links: [{ type: 'blocks', to: 'BD-2' }],
    });
    expect(badType.success).toBe(false);

    const noTarget = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      type: 'feature',
      status: 'todo',
      order: 100,
      links: [{ type: 'relates' }],
    });
    expect(noTarget.success).toBe(false);
  });
});

describe('ReleaseFrontmatterSchema', () => {
  it('accepts a minimal valid release', () => {
    const result = ReleaseFrontmatterSchema.safeParse({
      release: '1.0',
      status: 'current',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional name and dates', () => {
    const result = ReleaseFrontmatterSchema.safeParse({
      release: '1.0',
      status: 'future',
      name: 'First public beta',
      startDate: '2026-05-01',
      endDate: '2026-05-15',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = ReleaseFrontmatterSchema.safeParse({
      release: '1.0',
      status: 'open',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when status is missing', () => {
    const result = ReleaseFrontmatterSchema.safeParse({ release: '1.0' });
    expect(result.success).toBe(false);
  });
});

describe('EpicFrontmatterSchema', () => {
  it('accepts a minimal valid epic', () => {
    const result = EpicFrontmatterSchema.safeParse({
      name: 'UI Foundation',
      color: '#1f6feb',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when name is missing', () => {
    const result = EpicFrontmatterSchema.safeParse({ color: '#1f6feb' });
    expect(result.success).toBe(false);
  });

  it('rejects when color is missing', () => {
    const result = EpicFrontmatterSchema.safeParse({ name: 'Parser' });
    expect(result.success).toBe(false);
  });

  it('rejects a 3-digit hex color', () => {
    const result = EpicFrontmatterSchema.safeParse({
      name: 'Parser',
      color: '#abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a hex color without leading #', () => {
    const result = EpicFrontmatterSchema.safeParse({
      name: 'Parser',
      color: '1f6feb',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a hex color with extra digits', () => {
    const result = EpicFrontmatterSchema.safeParse({
      name: 'Parser',
      color: '#1f6febg',
    });
    expect(result.success).toBe(false);
  });
});

describe('BoardConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 47,
      projectName: 'My Project',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a config without projectName', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 47,
    });
    expect(result.success).toBe(false);
  });

  it('rejects tasksDir because data location belongs to the shell', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      tasksDir: '../private-todos',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional theme', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      projectName: 'My Project',
      theme: 'dark',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown theme value', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      theme: 'sepia',
    });
    expect(result.success).toBe(false);
  });

  it('rejects legacy statuses field (strict mode)', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      statuses: ['todo', 'done'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects legacy paths field (strict mode)', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      paths: { releases: 'releases', epics: 'epics' },
    });
    expect(result.success).toBe(false);
  });
});
