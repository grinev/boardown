import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_TASK_TYPE_META, FALLBACK_TYPE_COLOR, TASK_TYPES } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS } from './theme-tokens';

// The palette lives in ui's stylesheet and the vocabulary a shared theme may
// override lives here; this is what keeps a token added to one from going
// missing in the other.
const themeCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ui/src/theme/theme.css'),
  'utf-8',
);

const declared = (block: string): string[] =>
  [...new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? ''))].sort();

describe('the shared theme tokens', () => {
  it('name every palette variable of theme.css but the font family', () => {
    const palette = declared(themeCss).filter((name) => name !== '--font-family');
    expect([...THEME_TOKENS.keys()].sort()).toEqual(palette);
  });

  it('mark the shadows as shadows and everything else as a colour', () => {
    const shadows = [...THEME_TOKENS].filter(([, kind]) => kind === 'shadow').map(([name]) => name);
    expect(shadows.sort()).toEqual([
      '--card-shadow',
      '--dialog-shadow',
      '--drag-shadow',
      '--popover-shadow',
      '--tab-active-shadow',
    ]);
  });
});

// A type icon reads its colour from the palette, while `boardown schema` prints
// core's hex; the two must be the same colour until a theme says otherwise.
const block = (selector: string): string => {
  const start = themeCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`theme.css has no ${selector} block`);
  return themeCss.slice(start, themeCss.indexOf('}', start));
};

const valueIn = (css: string, name: string): string | undefined =>
  new RegExp(String.raw`^\s*${name}\s*:\s*([^;]+);`, 'm').exec(css)?.[1]?.trim().toLowerCase();

describe.each(["[data-theme='light']", "[data-theme='dark']"])('the %s palette', (selector) => {
  const css = block(selector);

  it.each(TASK_TYPES)('gives the %s type the colour core prints', (key) => {
    expect(valueIn(css, `--type-${key}`)).toBe(BASE_TASK_TYPE_META[key].color.toLowerCase());
  });

  it('gives the fallback type colour the colour core prints', () => {
    expect(valueIn(css, '--type-fallback')).toBe(FALLBACK_TYPE_COLOR.toLowerCase());
  });
});
