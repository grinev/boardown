import type { Task } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { taskSummary } from './summary';

const task = (frontmatter: Partial<Task['frontmatter']>): Task => ({
  title: 'Drag & drop',
  description: 'A long body that must never reach a list payload.',
  frontmatter: {
    id: 'BD-42',
    type: 'feature',
    status: 'todo',
    order: 100,
    ...frontmatter,
  },
});

describe('taskSummary', () => {
  it('carries the card fields and never the description', () => {
    expect(taskSummary(task({}))).toEqual({
      id: 'BD-42',
      title: 'Drag & drop',
      type: 'feature',
      status: 'todo',
    });
  });

  it('counts a checklist as done/total', () => {
    const summary = taskSummary(
      task({
        checklist: [
          { id: 'c1', text: 'a', done: true },
          { id: 'c2', text: 'b', done: false },
          { id: 'c3', text: 'c', done: false },
        ],
      }),
    );
    expect(summary.checklist).toEqual({ done: 1, total: 3 });
  });

  it('omits an empty checklist and empty notes, matching the card', () => {
    const summary = taskSummary(task({ checklist: [], notes: [] }));
    expect(summary).not.toHaveProperty('checklist');
    expect(summary).not.toHaveProperty('notes');
  });

  it('counts notes and keeps the epic slug', () => {
    const summary = taskSummary(
      task({
        epic: 'ui-foundation',
        notes: [
          { id: 'n1', text: 'one', createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'n2', text: 'two', createdAt: '2026-01-02T00:00:00.000Z' },
        ],
      }),
    );
    expect(summary.notes).toBe(2);
    expect(summary.epic).toBe('ui-foundation');
  });

  it('does not expose links', () => {
    const summary = taskSummary(task({ links: [{ type: 'relates', to: 'BD-7' }] }));
    expect(summary).not.toHaveProperty('links');
  });
});
