import { describe, expect, it } from 'vitest';
import { nextChecklistItemId, nextTaskId, verifyNextId } from './id-generator.js';
import type { BoardConfig, ChecklistItem, Task } from './schemas.js';

const baseConfig: BoardConfig = {
  idPrefix: 'BD',
  nextId: 7,
  projectName: 'My Project',
};

const task = (id: string): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 100 },
});

describe('nextTaskId', () => {
  it('produces id from prefix and nextId, bumps counter', () => {
    const { id, config } = nextTaskId(baseConfig);
    expect(id).toBe('BD-7');
    expect(config.nextId).toBe(8);
  });

  it('does not mutate the input config', () => {
    nextTaskId(baseConfig);
    expect(baseConfig.nextId).toBe(7);
  });
});

describe('verifyNextId', () => {
  it('does nothing when nextId is already ahead', () => {
    const result = verifyNextId(baseConfig, [task('BD-1'), task('BD-5')]);
    expect(result.bumped).toBe(false);
    expect(result.config.nextId).toBe(7);
  });

  it('bumps nextId past the maximum existing id', () => {
    const result = verifyNextId(baseConfig, [task('BD-1'), task('BD-9'), task('BD-3')]);
    expect(result.bumped).toBe(true);
    expect(result.config.nextId).toBe(10);
  });

  it('ignores ids with a different prefix', () => {
    const result = verifyNextId(baseConfig, [task('BD-2'), task('XX-99'), task('BD-4')]);
    expect(result.bumped).toBe(false);
    expect(result.config.nextId).toBe(7);
  });

  it('handles empty task list', () => {
    const result = verifyNextId(baseConfig, []);
    expect(result.bumped).toBe(false);
    expect(result.config.nextId).toBe(7);
  });
});

describe('nextChecklistItemId', () => {
  const item = (id: string): ChecklistItem => ({ id, text: id, done: false });

  it('starts at c1 for an empty list', () => {
    expect(nextChecklistItemId([])).toBe('c1');
  });

  it('returns one past the maximum numeric suffix', () => {
    expect(nextChecklistItemId([item('c1'), item('c4'), item('c2')])).toBe('c5');
  });

  it('ignores ids that do not match the cN pattern', () => {
    expect(nextChecklistItemId([item('foo'), item('c3')])).toBe('c4');
  });
});
