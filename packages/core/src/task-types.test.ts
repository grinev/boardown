import { describe, expect, it } from 'vitest';
import type { BoardConfig } from './schemas.js';
import {
  defaultTaskType,
  enabledTaskTypeKeys,
  isEnabledTaskType,
  resolveTaskType,
} from './task-types.js';

const base: BoardConfig = { idPrefix: 'BD', nextId: 0, projectName: 'P' };

describe('task types', () => {
  it('keeps the four base types enabled when the board declares none', () => {
    expect(enabledTaskTypeKeys(base)).toEqual(['bug', 'feature', 'docs', 'tech']);
    expect(enabledTaskTypeKeys(undefined)).toEqual(['bug', 'feature', 'docs', 'tech']);
    expect(defaultTaskType(base)).toBe('feature');
  });

  it('treats an empty override list as all base types on', () => {
    expect(enabledTaskTypeKeys({ ...base, taskTypes: [] })).toEqual([
      'bug',
      'feature',
      'docs',
      'tech',
    ]);
  });

  it('hides a disabled base type and appends custom types in declaration order', () => {
    const config: BoardConfig = {
      ...base,
      taskTypes: [{ key: 'tech', disabled: true }],
      customTaskTypes: [{ key: 'ops', label: 'Ops' }, { key: 'growth' }],
    };
    expect(enabledTaskTypeKeys(config)).toEqual(['bug', 'feature', 'docs', 'ops', 'growth']);
    expect(isEnabledTaskType(config, 'tech')).toBe(false);
    expect(isEnabledTaskType(config, 'ops')).toBe(true);
  });

  it('turns a base type on with disabled: false', () => {
    const config: BoardConfig = {
      ...base,
      taskTypes: [{ key: 'tech', disabled: false }],
    };
    expect(isEnabledTaskType(config, 'tech')).toBe(true);
  });

  it('defaults to the first enabled type when feature is off', () => {
    const config: BoardConfig = {
      ...base,
      taskTypes: [{ key: 'feature', disabled: true }],
    };
    expect(defaultTaskType(config)).toBe('bug');
  });

  it('defaults to the first custom type when every base type is off', () => {
    const config: BoardConfig = {
      ...base,
      taskTypes: [
        { key: 'bug', disabled: true },
        { key: 'feature', disabled: true },
        { key: 'docs', disabled: true },
        { key: 'tech', disabled: true },
      ],
      customTaskTypes: [{ key: 'ops' }, { key: 'growth' }],
    };
    expect(defaultTaskType(config)).toBe('ops');
  });

  it('resolves a disabled base type to its built-in meta', () => {
    const config: BoardConfig = {
      ...base,
      taskTypes: [{ key: 'tech', disabled: true }],
    };
    expect(resolveTaskType(config, 'tech')).toEqual({
      key: 'tech',
      label: 'Tech',
      icon: 'wrench',
      color: '#8b5cf6',
      commitPrefix: 'chore',
      enabled: false,
    });
  });

  it('fills in absent custom fields', () => {
    const config: BoardConfig = { ...base, customTaskTypes: [{ key: 'ops' }] };
    expect(resolveTaskType(config, 'ops')).toEqual({
      key: 'ops',
      label: 'Ops',
      icon: 'circle',
      color: '#94a3b8',
      commitPrefix: 'ops',
      enabled: true,
    });
  });

  it('resolves a type nothing declares to the raw key and the neutral fallback', () => {
    expect(resolveTaskType(base, 'mystery')).toEqual({
      key: 'mystery',
      label: 'mystery',
      icon: 'circle',
      color: '#94a3b8',
      commitPrefix: 'mystery',
      enabled: false,
    });
  });
});
