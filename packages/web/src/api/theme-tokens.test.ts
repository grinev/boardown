import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    expect(shadows.sort()).toEqual(['--card-shadow', '--drag-shadow', '--tab-active-shadow']);
  });
});
