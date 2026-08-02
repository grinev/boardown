import { describe, expect, it } from 'vitest';
import type { Task } from './schemas.js';
import { normalizeSearchQuery, taskMatchRank } from './task-match.js';

const task = (
  id = 'BD-42',
  title = 'Implement card drag & drop',
  description = 'Allow tasks to be dragged between columns.',
): Task => ({
  title,
  description,
  frontmatter: { id, type: 'feature', status: 'todo', order: 100 },
});

const withId = { matchId: true } as const;

describe('taskMatchRank', () => {
  it('ignores the id unless asked', () => {
    expect(taskMatchRank(task(), 'BD-42')).toBeUndefined();
    expect(taskMatchRank(task(), 'bd-4')).toBeUndefined();
  });

  it('ranks an exact id match first when asked', () => {
    expect(taskMatchRank(task(), 'BD-42', withId)).toBe(0);
  });

  it('ranks an id substring and a title match together', () => {
    expect(taskMatchRank(task(), 'bd-4', withId)).toBe(1);
    expect(taskMatchRank(task(), 'drag', withId)).toBe(1);
  });

  it('ranks a description-only match last', () => {
    expect(taskMatchRank(task(), 'columns')).toBe(2);
  });

  it('prefers the title over the description when both match', () => {
    expect(taskMatchRank(task('BD-42', 'Drag & drop', 'drag again'), 'drag')).toBe(1);
  });

  it('matches case-insensitively', () => {
    expect(taskMatchRank(task(), 'DRAG')).toBe(1);
    expect(taskMatchRank(task(), 'bd-42', withId)).toBe(0);
  });

  it('matches a substring anywhere, not only a prefix', () => {
    expect(taskMatchRank(task(), 'rag')).toBe(1);
  });

  it('trims the query', () => {
    expect(taskMatchRank(task(), '  BD-42  ', withId)).toBe(0);
  });

  it('returns undefined for a query that occurs nowhere', () => {
    expect(taskMatchRank(task(), 'kanban')).toBeUndefined();
  });

  it('returns undefined for an empty or whitespace-only query', () => {
    expect(taskMatchRank(task(), '')).toBeUndefined();
    expect(taskMatchRank(task(), '   ')).toBeUndefined();
    expect(taskMatchRank(task(), '', withId)).toBeUndefined();
  });

  it('does not search notes, checklist items or custom fields', () => {
    const t: Task = {
      ...task('BD-42', 'Card polish', 'Nothing to see here.'),
      frontmatter: {
        id: 'BD-42',
        type: 'feature',
        status: 'todo',
        order: 100,
        checklist: [{ id: 'c1', text: 'wire up sensors', done: false }],
        notes: [
          { id: 'n1', text: 'jank on 200 cards', createdAt: '2026-05-02T09:30:00.000Z' },
        ],
        custom: { reporter: 'alice' },
      },
    };
    expect(taskMatchRank(t, 'sensors')).toBeUndefined();
    expect(taskMatchRank(t, 'jank')).toBeUndefined();
    expect(taskMatchRank(t, 'alice')).toBeUndefined();
  });

  it('treats a metacharacter as literal text', () => {
    expect(taskMatchRank(task('BD-1', 'Render [[docs]] refs'), '[[docs]]')).toBe(1);
  });
});

describe('normalizeSearchQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeSearchQuery('  BD-42 ')).toBe('bd-42');
  });
});
