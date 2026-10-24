import type { CSSProperties } from 'react';
import type { BoardConfig } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { taskTypeDisplay } from './task-types';

const config = {
  customTaskTypes: [{ key: 'ops' }, { key: 'growth', color: '#123456' }],
} as BoardConfig;

const typeColor = (type: string): unknown =>
  (taskTypeDisplay(config, type).style as CSSProperties & Record<string, unknown>)['--type-color'];

describe('taskTypeDisplay', () => {
  it("colours a base type from the theme's palette", () => {
    expect(typeColor('bug')).toBe('var(--type-bug)');
    expect(typeColor('tech')).toBe('var(--type-tech)');
  });

  it('colours a type without a colour of its own from the palette fallback', () => {
    expect(typeColor('ops')).toBe('var(--type-fallback)');
    expect(typeColor('mystery')).toBe('var(--type-fallback)');
  });

  it('keeps the colour a board declares for its own type', () => {
    expect(typeColor('growth')).toBe('#123456');
  });
});
