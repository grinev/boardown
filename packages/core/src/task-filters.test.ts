import { describe, expect, it } from 'vitest';
import type { Task } from './schemas.js';
import { taskMatchesFilters } from './task-filters.js';

const task = (fm: Partial<Task['frontmatter']> = {}): Task => ({
  title: 'T',
  description: '',
  frontmatter: {
    id: 'BD-1',
    type: 'feature',
    status: 'todo',
    order: 100,
    ...fm,
  },
});

describe('taskMatchesFilters', () => {
  it('passes everything when the selection is empty', () => {
    expect(taskMatchesFilters(task(), {})).toBe(true);
    expect(taskMatchesFilters(task(), { statuses: [], types: [], priorities: [] })).toBe(true);
  });

  it('ORs within one dimension', () => {
    expect(
      taskMatchesFilters(task({ type: 'bug' }), { types: ['bug', 'docs'] }),
    ).toBe(true);
    expect(
      taskMatchesFilters(task({ type: 'docs' }), { types: ['bug', 'docs'] }),
    ).toBe(true);
    expect(
      taskMatchesFilters(task({ type: 'feature' }), { types: ['bug', 'docs'] }),
    ).toBe(false);
  });

  it('ANDs across dimensions', () => {
    const bugTodo = task({ type: 'bug', status: 'todo' });
    expect(
      taskMatchesFilters(bugTodo, { types: ['bug'], statuses: ['todo'] }),
    ).toBe(true);
    expect(
      taskMatchesFilters(bugTodo, { types: ['bug'], statuses: ['done'] }),
    ).toBe(false);
  });

  it('treats an omitted epic fact as no epic filter', () => {
    expect(taskMatchesFilters(task(), { types: ['feature'] })).toBe(true);
  });

  it('honours a caller-resolved epic fact', () => {
    expect(taskMatchesFilters(task(), { epicMatches: true })).toBe(true);
    expect(taskMatchesFilters(task(), { epicMatches: false })).toBe(false);
    expect(
      taskMatchesFilters(task({ type: 'bug' }), { types: ['bug'], epicMatches: false }),
    ).toBe(false);
  });

  it('does not match a status that is not in the selection', () => {
    expect(taskMatchesFilters(task({ status: 'todo' }), { statuses: ['done'] })).toBe(false);
  });

  it('does not match a task whose status the board does not declare', () => {
    expect(
      taskMatchesFilters(task({ status: 'ghost' }), { statuses: ['todo', 'done'] }),
    ).toBe(false);
  });

  it('matches an absent priority key when the selection includes the default', () => {
    expect(taskMatchesFilters(task(), { priorities: ['medium'] })).toBe(true);
    expect(taskMatchesFilters(task(), { priorities: ['high'] })).toBe(false);
    expect(
      taskMatchesFilters(task({ priority: 'high' }), { priorities: ['medium', 'high'] }),
    ).toBe(true);
  });

  it('matches any selected label, ignoring case', () => {
    const backend = task({ labels: ['Backend', 'ui'] });
    expect(taskMatchesFilters(backend, { labels: ['backend'] })).toBe(true);
    expect(taskMatchesFilters(backend, { labels: ['docs', 'UI'] })).toBe(true);
    expect(taskMatchesFilters(backend, { labels: ['docs'] })).toBe(false);
    expect(taskMatchesFilters(task(), { labels: ['backend'] })).toBe(false);
  });

  it('matches a task with no labels when noLabels is set, on its own or with labels', () => {
    expect(taskMatchesFilters(task(), { noLabels: true })).toBe(true);
    expect(taskMatchesFilters(task({ labels: ['ui'] }), { noLabels: true })).toBe(false);
    expect(taskMatchesFilters(task(), { noLabels: true, labels: ['ui'] })).toBe(true);
    expect(
      taskMatchesFilters(task({ labels: ['ui'] }), { noLabels: true, labels: ['ui'] }),
    ).toBe(true);
    expect(
      taskMatchesFilters(task({ labels: ['docs'] }), { noLabels: true, labels: ['ui'] }),
    ).toBe(false);
  });

  it('skips the label dimension when nothing is selected', () => {
    expect(taskMatchesFilters(task({ labels: ['ui'] }), { labels: [], noLabels: false })).toBe(
      true,
    );
  });

  it('ANDs the label dimension with the others', () => {
    const bug = task({ type: 'bug', labels: ['ui'] });
    expect(taskMatchesFilters(bug, { types: ['bug'], labels: ['ui'] })).toBe(true);
    expect(taskMatchesFilters(bug, { types: ['docs'], labels: ['ui'] })).toBe(false);
    expect(taskMatchesFilters(bug, { epicMatches: false, labels: ['ui'] })).toBe(false);
  });
});
