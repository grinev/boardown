import type { Epic } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { EPIC_COLORS, pickDefaultEpicColor } from './epic-colors';

const epicWithColor = (color: string): Epic => ({
  filename: `epics/e-${color}.md`,
  slug: `e-${color}`,
  frontmatter: { name: color, color },
  preamble: '',
  tasks: [],
});

describe('pickDefaultEpicColor', () => {
  it('returns the first palette color when nothing is used', () => {
    expect(pickDefaultEpicColor([])).toBe(EPIC_COLORS[0]);
  });

  it('skips colors already taken', () => {
    const used = epicWithColor(EPIC_COLORS[0]!);
    expect(pickDefaultEpicColor([used])).toBe(EPIC_COLORS[1]);
  });

  it('matches used colors case-insensitively', () => {
    const used = epicWithColor(EPIC_COLORS[0]!.toUpperCase());
    expect(pickDefaultEpicColor([used])).toBe(EPIC_COLORS[1]);
  });

  it('falls back to the first color when the whole palette is used', () => {
    const used = EPIC_COLORS.map(epicWithColor);
    expect(pickDefaultEpicColor(used)).toBe(EPIC_COLORS[0]);
  });
});
