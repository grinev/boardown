import { describe, expect, it } from 'vitest';
import { BoardConfigSchema, TaskFrontmatterSchema } from './schemas.js';

describe('TaskFrontmatterSchema', () => {
  it('accepts a minimal valid frontmatter', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      status: 'todo',
      order: 100,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional epic', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-2',
      status: 'in-progress',
      epic: 'ui-foundation',
      order: 200,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when order is not an integer', () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: 'BD-1',
      status: 'todo',
      order: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required fields are missing', () => {
    const result = TaskFrontmatterSchema.safeParse({ status: 'todo', order: 100 });
    expect(result.success).toBe(false);
  });
});

describe('BoardConfigSchema', () => {
  it('accepts a valid config', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 47,
      statuses: ['todo', 'in-progress', 'done'],
      paths: { releases: 'releases', epics: 'epics' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty status list', () => {
    const result = BoardConfigSchema.safeParse({
      idPrefix: 'BD',
      nextId: 0,
      statuses: [],
      paths: { releases: 'releases', epics: 'epics' },
    });
    expect(result.success).toBe(false);
  });
});
