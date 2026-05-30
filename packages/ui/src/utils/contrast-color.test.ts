import { describe, expect, it } from 'vitest';
import { pickContrastText } from './contrast-color';

describe('pickContrastText', () => {
  it('returns white text on a dark background', () => {
    expect(pickContrastText('#000000')).toBe('#fff');
    expect(pickContrastText('#1f6feb')).toBe('#fff');
  });

  it('returns black text on a light background', () => {
    expect(pickContrastText('#ffffff')).toBe('#000');
    expect(pickContrastText('#eab308')).toBe('#000');
  });
});
