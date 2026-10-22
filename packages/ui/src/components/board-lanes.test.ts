import { describe, expect, it } from 'vitest';
import type { BoardConfig, Epic, Task } from '@boardown/core';
import { boardLanes, type BoardLane } from './board-lanes';

const task = (id: string, extra: { epic?: string; type?: string } = {}): Task => ({
  title: id,
  description: '',
  frontmatter: {
    id,
    type: extra.type ?? 'feature',
    status: 'todo',
    order: 0,
    ...(extra.epic === undefined ? {} : { epic: extra.epic }),
  },
});

const epic = (slug: string, name: string): Epic => ({
  filename: `epics/${slug}.md`,
  slug,
  frontmatter: { name, color: '#2563EB' },
  preamble: '',
});

const summary = (lanes: BoardLane[]): [string, string[]][] =>
  lanes.map((lane) => [lane.key, lane.tasks.map((t) => t.frontmatter.id)]);

describe('boardLanes by epic', () => {
  it('orders lanes by epic name, ties by slug, then No epic last', () => {
    const epics = [epic('zeta', 'Core'), epic('beta', 'api'), epic('alpha', 'Core')];
    const lanes = boardLanes(
      [
        task('BD-1', { epic: 'zeta' }),
        task('BD-2'),
        task('BD-3', { epic: 'beta' }),
        task('BD-4', { epic: 'alpha' }),
        task('BD-5', { epic: 'zeta' }),
      ],
      'epic',
      epics,
      null,
    );
    expect(summary(lanes)).toEqual([
      ['epic:beta', ['BD-3']],
      ['epic:alpha', ['BD-4']],
      ['epic:zeta', ['BD-1', 'BD-5']],
      ['no-epic', ['BD-2']],
    ]);
  });

  it('puts a task naming no epic file into No epic', () => {
    const lanes = boardLanes([task('BD-1', { epic: 'gone' })], 'epic', [epic('core', 'Core')], null);
    expect(summary(lanes)).toEqual([['no-epic', ['BD-1']]]);
  });

  it('shows no lane without a task', () => {
    const lanes = boardLanes([task('BD-1', { epic: 'core' })], 'epic', [epic('core', 'Core'), epic('ui', 'UI')], null);
    expect(summary(lanes)).toEqual([['epic:core', ['BD-1']]]);
    expect(boardLanes([], 'epic', [epic('core', 'Core')], null)).toEqual([]);
  });
});

describe('boardLanes by type', () => {
  it('follows base order, then custom types, then undeclared types by key', () => {
    const config: Pick<BoardConfig, 'taskTypes' | 'customTaskTypes'> = {
      taskTypes: [{ key: 'docs', disabled: true }],
      customTaskTypes: [{ key: 'ops' }, { key: 'chore' }],
    };
    const lanes = boardLanes(
      [
        task('BD-1', { type: 'zzz' }),
        task('BD-2', { type: 'chore' }),
        task('BD-3', { type: 'docs' }),
        task('BD-4', { type: 'aaa' }),
        task('BD-5', { type: 'ops' }),
        task('BD-6', { type: 'bug' }),
        task('BD-7', { type: 'bug' }),
      ],
      'type',
      [],
      config,
    );
    expect(summary(lanes)).toEqual([
      ['type:bug', ['BD-6', 'BD-7']],
      ['type:docs', ['BD-3']],
      ['type:ops', ['BD-5']],
      ['type:chore', ['BD-2']],
      ['type:aaa', ['BD-4']],
      ['type:zzz', ['BD-1']],
    ]);
  });
});
