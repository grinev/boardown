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
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional tasksDir', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      tasksDir: '../private-todos',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional theme', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
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
