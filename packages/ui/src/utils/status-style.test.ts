import { describe, expect, it } from 'vitest';
import type { BoardConfig } from '@boardown/core';
import { statusColorStyle, statusDisplayLabel } from './status-style';

const base: BoardConfig = { idPrefix: 'BD', nextId: 0, projectName: 'P' };

const bg = (config: BoardConfig | undefined, status: string): unknown =>
  (statusColorStyle(config, status) as Record<string, unknown>)['--status-bg'];

describe('statusColorStyle', () => {
  it('gives the default board its three original pairs', () => {
    expect(bg(base, 'todo')).toBe('var(--status-todo-bg)');
    expect(bg(base, 'in-progress')).toBe('var(--status-mid-1-bg)');
    expect(bg(base, 'done')).toBe('var(--status-done-bg)');
    expect(bg(undefined, 'todo')).toBe('var(--status-todo-bg)');
  });

  it('numbers the middles in declaration order between the two ends', () => {
    const config: BoardConfig = {
      ...base,
      statuses: [
        { key: 'a' },
        { key: 'b' },
        { key: 'c' },
        { key: 'd' },
        { key: 'e' },
        { key: 'f' },
        { key: 'g' },
        { key: 'h' },
      ],
    };
    expect(bg(config, 'a')).toBe('var(--status-todo-bg)');
    expect(bg(config, 'b')).toBe('var(--status-mid-1-bg)');
    expect(bg(config, 'g')).toBe('var(--status-mid-6-bg)');
    expect(bg(config, 'h')).toBe('var(--status-done-bg)');
  });

  it('gives a status the board no longer declares the neutral pair', () => {
    const config: BoardConfig = { ...base, statuses: [{ key: 'open' }, { key: 'closed' }] };
    expect(bg(config, 'in-progress')).toBe('var(--status-unknown-bg)');
    expect(statusColorStyle(config, 'in-progress')).toEqual({
      '--status-bg': 'var(--status-unknown-bg)',
      '--status-fg': 'var(--status-unknown-fg)',
    });
  });
});

describe('statusDisplayLabel', () => {
  it('prefers a declared label and falls back to the prettified key', () => {
    const config: BoardConfig = {
      ...base,
      statuses: [{ key: 'backlog', label: 'Not started' }, { key: 'in_review' }],
    };
    expect(statusDisplayLabel(config, 'backlog')).toBe('Not started');
    expect(statusDisplayLabel(config, 'in_review')).toBe('In review');
    expect(statusDisplayLabel(config, 'left-over')).toBe('Left over');
  });
});
