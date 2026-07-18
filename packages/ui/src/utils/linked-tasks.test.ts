import type { BoardSnapshot, Release, Task, TaskLink } from '@boardown/core';
import { emptyDocsTree } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { collectLinkedTasks } from './linked-tasks';

const task = (id: string, links?: TaskLink[]): Task => ({
  title: id,
  description: '',
  frontmatter: {
    id,
    type: 'feature',
    status: 'todo',
    order: 100,
    ...(links ? { links } : {}),
  },
});

const release = (
  slug: string,
  status: Release['frontmatter']['status'],
  tasks: Task[],
): Release => ({
  filename: `releases/${slug}.md`,
  slug,
  frontmatter: { status, name: slug },
  preamble: '',
  tasks,
});

const snapshot = (releases: Release[]): BoardSnapshot => ({
  config: { idPrefix: 'BD', nextId: 9, projectName: 'P' },
  releases,
  epics: [],
  backlog: null,
  docs: emptyDocsTree(),
  problems: [],
});

describe('collectLinkedTasks', () => {
  it('lists the tasks this task points at', () => {
    const snap = snapshot([
      release('1.0', 'current', [
        task('BD-1', [{ type: 'relates', to: 'BD-2' }]),
        task('BD-2', [{ type: 'relates', to: 'BD-1' }]),
      ]),
    ]);

    const rows = collectLinkedTasks(snap, 'BD-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.task.frontmatter.id).toBe('BD-2');
    expect(rows[0]!.type).toBe('relates');
    expect(rows[0]!.archived).toBe(false);
  });

  it('shows a half-written link from the side that does not hold the record', () => {
    const snap = snapshot([
      release('1.0', 'current', [
        task('BD-1', [{ type: 'relates', to: 'BD-2' }]),
        task('BD-2'),
      ]),
    ]);

    const rows = collectLinkedTasks(snap, 'BD-2');

    expect(rows.map((r) => r.task.frontmatter.id)).toEqual(['BD-1']);
  });

  it('deduplicates the mirrored record', () => {
    const snap = snapshot([
      release('1.0', 'current', [
        task('BD-1', [{ type: 'relates', to: 'BD-2' }]),
        task('BD-2', [{ type: 'relates', to: 'BD-1' }]),
      ]),
    ]);

    expect(collectLinkedTasks(snap, 'BD-2')).toHaveLength(1);
  });

  it('lists outgoing links first, then incoming ones by id', () => {
    const snap = snapshot([
      release('1.0', 'current', [
        task('BD-1', [{ type: 'relates', to: 'BD-9' }]),
        task('BD-9'),
        task('BD-5', [{ type: 'relates', to: 'BD-1' }]),
      ]),
      release('1.1', 'future', [task('BD-3', [{ type: 'relates', to: 'BD-1' }])]),
    ]);

    const rows = collectLinkedTasks(snap, 'BD-1');

    expect(rows.map((r) => r.task.frontmatter.id)).toEqual(['BD-9', 'BD-3', 'BD-5']);
  });

  it('drops a link whose target is not on the board', () => {
    const snap = snapshot([
      release('1.0', 'current', [task('BD-1', [{ type: 'relates', to: 'BD-99' }])]),
    ]);

    expect(collectLinkedTasks(snap, 'BD-1')).toEqual([]);
  });

  it('flags a linked task that lives in a finished release', () => {
    const snap = snapshot([
      release('1.0', 'current', [task('BD-1', [{ type: 'relates', to: 'BD-2' }])]),
      release('0.9', 'finished', [task('BD-2')]),
    ]);

    const rows = collectLinkedTasks(snap, 'BD-1');

    expect(rows[0]!.archived).toBe(true);
  });
});
