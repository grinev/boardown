import { describe, expect, it } from 'vitest';
import { pickContrastText } from './contrast-color';

describe('pickContrastText', () => {
  it('returns the light text on a dark background', () => {
    expect(pickContrastText('#000000')).toBe('var(--epic-text-light)');
    expect(pickContrastText('#1f6feb')).toBe('var(--epic-text-light)');
  });

  it('returns the dark text on a light background', () => {
    expect(pickContrastText('#ffffff')).toBe('var(--epic-text-dark)');
    expect(pickContrastText('#eab308')).toBe('var(--epic-text-dark)');
  });
});
