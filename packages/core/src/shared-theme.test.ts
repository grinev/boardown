import { describe, expect, it } from 'vitest';
import { displayedTheme, sharedThemeOverrides, type SharedTheme } from './shared-theme.js';

const studio: SharedTheme = {
  id: 'studio',
  name: 'Studio',
  base: 'dark',
  fontFamily: '"Inter", sans-serif',
  tokens: { '--accent': '#7c5cff' },
};

describe('displayedTheme', () => {
  it("shows a shared theme's base over the board's own theme", () => {
    expect(displayedTheme(studio, 'light')).toBe('dark');
  });

  it("shows the board's own theme with no shared theme", () => {
    expect(displayedTheme(null, 'dark')).toBe('dark');
  });
});

describe('sharedThemeOverrides', () => {
  it('carries the tokens and the font family as CSS variables', () => {
    expect(sharedThemeOverrides(studio)).toEqual({
      '--accent': '#7c5cff',
      '--font-family': '"Inter", sans-serif',
    });
  });

  it('leaves the font alone when the theme names none', () => {
    expect(sharedThemeOverrides({ id: 'plain', name: 'Plain', base: 'light', tokens: {} })).toEqual(
      {},
    );
  });

  it('is empty with no shared theme', () => {
    expect(sharedThemeOverrides(null)).toEqual({});
  });
});
