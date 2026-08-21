import { describe, expect, it } from 'vitest';
import type { BoardConfig } from './schemas.js';
import {
  boardStatusKeys,
  boardStatuses,
  initialStatus,
  isDeclaredStatus,
  isMiddleStatus,
  isTerminalStatus,
  middleStatusKeys,
  statusIndex,
  statusLabel,
  terminalStatus,
} from './statuses.js';

const base: BoardConfig = { idPrefix: 'BD', nextId: 0, projectName: 'P' };

const withStatuses = (...keys: string[]): BoardConfig => ({
  ...base,
  statuses: keys.map((key) => ({ key })),
});

describe('board statuses', () => {
  it('falls back to the default three when the board declares none', () => {
    expect(boardStatusKeys(base)).toEqual(['todo', 'in-progress', 'done']);
    expect(boardStatusKeys(undefined)).toEqual(['todo', 'in-progress', 'done']);
    expect(initialStatus(base)).toBe('todo');
    expect(terminalStatus(base)).toBe('done');
    expect(middleStatusKeys(base)).toEqual(['in-progress']);
  });

  it('reads the declared list in file order', () => {
    const config = withStatuses('backlog', 'dev', 'review', 'shipped');
    expect(boardStatusKeys(config)).toEqual(['backlog', 'dev', 'review', 'shipped']);
    expect(initialStatus(config)).toBe('backlog');
    expect(terminalStatus(config)).toBe('shipped');
    expect(middleStatusKeys(config)).toEqual(['dev', 'review']);
    expect(isMiddleStatus(config, 'dev')).toBe(true);
    expect(isMiddleStatus(config, 'review')).toBe(true);
    expect(isMiddleStatus(config, 'backlog')).toBe(false);
    expect(isMiddleStatus(config, 'shipped')).toBe(false);
  });

  it('has no middles when only two statuses are declared', () => {
    const config = withStatuses('open', 'closed');
    expect(middleStatusKeys(config)).toEqual([]);
    expect(isMiddleStatus(config, 'open')).toBe(false);
    expect(isMiddleStatus(config, 'closed')).toBe(false);
    expect(initialStatus(config)).toBe('open');
    expect(terminalStatus(config)).toBe('closed');
  });

  it('answers "not declared" for a status the board dropped', () => {
    const config = withStatuses('open', 'closed');
    expect(isDeclaredStatus(config, 'in-progress')).toBe(false);
    expect(statusIndex(config, 'in-progress')).toBe(-1);
    expect(isMiddleStatus(config, 'in-progress')).toBe(false);
    expect(isTerminalStatus(config, 'in-progress')).toBe(false);
  });

  it('reports a declared label and nothing for an undeclared key', () => {
    const config: BoardConfig = {
      ...base,
      statuses: [{ key: 'backlog', label: 'To do' }, { key: 'shipped' }],
    };
    expect(statusLabel(config, 'backlog')).toBe('To do');
    expect(statusLabel(config, 'shipped')).toBeUndefined();
    expect(statusLabel(config, 'nope')).toBeUndefined();
    expect(boardStatuses(config)).toHaveLength(2);
  });
});
