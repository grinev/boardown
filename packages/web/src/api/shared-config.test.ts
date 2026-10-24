import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSharedConfigSource, isValidCssValue, openSharedConfig } from './shared-config';

let dir = '';

const write = async (relative: string, content: string): Promise<void> => {
  const target = path.join(dir, ...relative.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf-8');
};

const theme = (body: unknown): string => JSON.stringify(body);

const read = async () => createSharedConfigSource(dir).read();

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-shared-config-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the shared configuration', () => {
  it('applies no theme when config.yaml selects none', async () => {
    await write('config.yaml', '# nothing here yet\n');
    expect(await read()).toEqual({ theme: null, error: null });
  });

  it('ignores keys it does not know', async () => {
    await write('config.yaml', 'theme: dark\nfutureSetting: 3\n');
    expect((await read()).theme?.id).toBe('dark');
  });

  it('selects the built-ins by their lowercase names', async () => {
    await write('config.yaml', 'theme: light\n');
    await write('themes/light.json', theme({ base: 'dark' }));
    expect((await read()).theme).toEqual({ id: 'light', name: 'Light', base: 'light', tokens: {} });
  });

  it('resolves a partial custom theme over its base', async () => {
    await write('config.yaml', 'theme: ocean\n');
    await write(
      'themes/ocean.json',
      theme({
        name: 'Ocean',
        base: 'dark',
        fontFamily: '"Inter", system-ui, sans-serif',
        tokens: {
          '--accent': 'oklch(0.7 0.1 200)',
          '--card-shadow': '0 1px 2px rgba(0, 0, 0, 0.4), inset 0 0 0 1px #000',
          '--tab-bg-active': 'var(--bg)',
        },
      }),
    );
    expect((await read()).theme).toEqual({
      id: 'ocean',
      name: 'Ocean',
      base: 'dark',
      fontFamily: '"Inter", system-ui, sans-serif',
      tokens: {
        '--accent': 'oklch(0.7 0.1 200)',
        '--card-shadow': '0 1px 2px rgba(0, 0, 0, 0.4), inset 0 0 0 1px #000',
        '--tab-bg-active': 'var(--bg)',
      },
    });
  });

  it('drops unknown fields, unknown tokens and --font-family inside tokens', async () => {
    await write('config.yaml', 'theme: ocean\n');
    await write(
      'themes/ocean.json',
      theme({
        base: 'light',
        future: { nested: true },
        tokens: { '--not-a-token': 12, '--font-family': 'serif', '--bg': '#123456' },
      }),
    );
    const { theme: resolved, error } = await read();
    expect(error).toBeNull();
    expect(resolved?.tokens).toEqual({ '--bg': '#123456' });
    expect(resolved?.name).toBe('ocean');
  });

  it('tolerates a byte order mark', async () => {
    await write('config.yaml', 'theme: ocean\n');
    await write('themes/ocean.json', String.fromCharCode(0xfeff) + theme({ base: 'dark' }));
    expect((await read()).error).toBeNull();
  });

  it.each([
    ['malformed YAML', 'theme: [oops\n', null, 'config.yaml: invalid YAML'],
    ['a list instead of a mapping', '- dark\n', null, 'config.yaml'],
    ['a non-string theme', 'theme: 3\n', null, 'config.yaml: theme: must be a theme name'],
    ['an empty theme', 'theme: ""\n', null, 'config.yaml: theme: must be a plain name'],
    ['a path in the theme', 'theme: ../escape\n', null, 'config.yaml: theme: must be a plain name'],
    ['a missing themes folder', 'theme: ocean\n', null, 'but themes/ is missing'],
    ['malformed JSON', 'theme: ocean\n', '{ base: dark', 'themes/ocean.json: invalid JSON'],
    ['a non-object theme', 'theme: ocean\n', '[]', 'themes/ocean.json'],
    ['a missing base', 'theme: ocean\n', theme({}), 'themes/ocean.json: base: must be "light" or "dark"'],
    ['an invalid base', 'theme: ocean\n', theme({ base: 'sepia' }), 'base: must be "light" or "dark"'],
    ['a non-string name', 'theme: ocean\n', theme({ base: 'dark', name: 1 }), 'name: must be a string'],
    ['a non-string fontFamily', 'theme: ocean\n', theme({ base: 'dark', fontFamily: 1 }), 'fontFamily: must be a string'],
    ['non-object tokens', 'theme: ocean\n', theme({ base: 'dark', tokens: 'red' }), 'tokens: must be an object'],
    ['a non-string known token', 'theme: ocean\n', theme({ base: 'dark', tokens: { '--bg': 1 } }), 'tokens.--bg: must be a string'],
    ['an invalid colour', 'theme: ocean\n', theme({ base: 'dark', tokens: { '--bg': 'nope' } }), 'tokens.--bg: "nope" is not a valid color value'],
    ['an empty colour', 'theme: ocean\n', theme({ base: 'dark', tokens: { '--bg': '' } }), 'is not a valid color value'],
    ['an invalid shadow', 'theme: ocean\n', theme({ base: 'dark', tokens: { '--card-shadow': '12' } }), 'is not a valid box-shadow value'],
    ['an invalid fontFamily', 'theme: ocean\n', theme({ base: 'dark', fontFamily: '12px' }), 'fontFamily: "12px" is not a valid font-family value'],
  ])('refuses %s', async (_label, config, themeFile, message) => {
    await write('config.yaml', config);
    if (themeFile !== null) await write('themes/ocean.json', themeFile);
    const { theme: resolved, error } = await read();
    expect(resolved).toBeNull();
    expect(error).toContain(message);
  });

  it('matches a theme id against the folder listing, case and all', async () => {
    await write('config.yaml', 'theme: Ocean\n');
    await write('themes/ocean.json', theme({ base: 'dark' }));
    const { error } = await read();
    expect(error).toContain('theme "Ocean" has no file themes/Ocean.json');
    expect(error).toContain('"light" and "dark"');
  });

  it('refuses a directory that is missing, a file, or has no config.yaml', async () => {
    expect((await read()).error).toBe('config.yaml is missing');
    await fs.rm(dir, { recursive: true });
    expect((await read()).error).toContain('does not exist');
    await fs.writeFile(dir, 'not a folder', 'utf-8');
    expect((await read()).error).toContain('is not a folder');
    await fs.rm(dir);
    await fs.mkdir(dir);
  });

  it('keeps the last valid theme through a bad edit and clears the error after a fix', async () => {
    await write('config.yaml', 'theme: ocean\n');
    await write('themes/ocean.json', theme({ base: 'dark', tokens: { '--bg': '#000000' } }));
    const source = createSharedConfigSource(dir);
    const first = await source.read();

    await write('themes/ocean.json', theme({ base: 'dark', tokens: { '--bg': 'nope' } }));
    const broken = await source.read();
    expect(broken.theme).toEqual(first.theme);
    expect(broken.error).toContain('"nope"');

    await fs.rm(path.join(dir, 'themes', 'ocean.json'));
    expect((await source.read()).theme).toEqual(first.theme);

    await write('themes/ocean.json', theme({ base: 'dark' }));
    expect(await source.read()).toEqual({
      theme: { id: 'ocean', name: 'ocean', base: 'dark', tokens: {} },
      error: null,
    });
  });

  it('lets a removed theme key restore the boards', async () => {
    await write('config.yaml', 'theme: dark\n');
    const source = createSharedConfigSource(dir);
    expect((await source.read()).theme?.id).toBe('dark');
    await write('config.yaml', '{}\n');
    expect(await source.read()).toEqual({ theme: null, error: null });
  });

  it('refuses to open on a first read that fails, naming the directory', async () => {
    await write('config.yaml', 'theme: ocean\n');
    await expect(openSharedConfig(dir)).rejects.toThrow(
      `Shared configuration ${dir} cannot be used: config.yaml: theme "ocean" needs themes/ocean.json, but themes/ is missing`,
    );
  });
});

describe('isValidCssValue', () => {
  it.each([
    ['color', 'light-dark(#fff, #000)'],
    ['color', 'color-mix(in srgb, red 50%, blue)'],
    ['color', 'var(--accent, #000)'],
    ['box-shadow', 'none'],
    ['font-family', 'Georgia, serif'],
  ])('accepts %s: %s', (property, value) => {
    expect(isValidCssValue(property, value)).toBe(true);
  });

  it.each([
    ['color', 'red; }'],
    ['color', 'var(--x); color: red'],
    ['color', '   '],
    ['font-family', ''],
  ])('refuses %s: %s', (property, value) => {
    expect(isValidCssValue(property, value)).toBe(false);
  });
});
