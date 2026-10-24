import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SharedTheme } from '../../../core/src/shared-theme';
import { parsePageBoot } from '../page-boot';
import { buildPageBoot, stampPage } from './page-boot';
import { createSharedConfigSource } from './shared-config';

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>boardown</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const studio: SharedTheme = {
  id: 'studio',
  name: 'Studio',
  base: 'dark',
  fontFamily: '"Inter", sans-serif',
  tokens: { '--accent': '#7c5cff' },
};

const payloadOf = (html: string): unknown =>
  parsePageBoot(/<script type="application\/json" id="boardown-boot">(.*?)<\/script>/.exec(html)?.[1]);

describe('stampPage', () => {
  it("puts the board's theme on <html> and the payload in the head", () => {
    const html = stampPage(PAGE, { theme: 'dark' });
    expect(html).toContain('<html lang="en" data-theme="dark">');
    expect(html).toMatch(/<script type="application\/json" id="boardown-boot">.*<\/script><\/head>/);
    expect(payloadOf(html)).toEqual({ theme: 'dark' });
  });

  it('adds no style without a shared theme', () => {
    expect(stampPage(PAGE, { theme: 'light' })).not.toContain('style=');
  });

  it("shows a shared theme's base and overrides over the board's own theme", () => {
    const boot = { theme: 'light' as const, sharedTheme: { theme: studio, error: null } };
    const html = stampPage(PAGE, boot);
    expect(html).toContain(
      '<html lang="en" data-theme="dark" style="--accent: #7c5cff; --font-family: &quot;Inter&quot;, sans-serif">',
    );
    expect(payloadOf(html)).toEqual(boot);
  });

  it('keeps every value inside its element', () => {
    const hostile: SharedTheme = { ...studio, name: '</script><b>', tokens: { '--bg': 'a&b' } };
    const html = stampPage(PAGE, { theme: 'light', sharedTheme: { theme: hostile, error: null } });
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('--bg: a&amp;b');
    expect(payloadOf(html)).toMatchObject({ sharedTheme: { theme: { name: '</script><b>' } } });
  });

  it('stamps a document with no head', () => {
    const html = stampPage('<html>THE APP</html>', { theme: 'dark' });
    expect(html).toMatch(/^<html data-theme="dark"><script [^>]*>[^<]*<\/script>THE APP<\/html>$/);
  });
});

describe('buildPageBoot', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-page-boot-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const writeConfig = (text: string): Promise<void> =>
    fs.writeFile(path.join(dir, 'config.yaml'), text, 'utf-8');

  const writeShared = async (theme: string, file?: string): Promise<string> => {
    const configDir = path.join(dir, 'shared');
    await fs.mkdir(path.join(configDir, 'themes'), { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.yaml'), `theme: ${theme}\n`, 'utf-8');
    if (file !== undefined) {
      await fs.writeFile(path.join(configDir, 'themes', `${theme}.json`), file, 'utf-8');
    }
    return configDir;
  };

  it("reads the board's own theme", async () => {
    await writeConfig('idPrefix: BD\nnextId: 1\nprojectName: P\ntheme: dark\n');
    expect(await buildPageBoot(dir, undefined)).toEqual({ theme: 'dark' });
  });

  it('is light for a board with no config yet', async () => {
    expect(await buildPageBoot(dir, undefined)).toEqual({ theme: 'light' });
  });

  it('is light for a config the loader would refuse', async () => {
    await writeConfig('theme: dark\n');
    expect(await buildPageBoot(dir, undefined)).toEqual({ theme: 'light' });
  });

  it("carries the shared source's state", async () => {
    await writeConfig('idPrefix: BD\nnextId: 1\nprojectName: P\n');
    const source = createSharedConfigSource(await writeShared('dark'));
    expect(await buildPageBoot(dir, source)).toEqual({
      theme: 'light',
      sharedTheme: {
        theme: { id: 'dark', name: 'Dark', base: 'dark', tokens: {} },
        error: null,
      },
    });
  });

  it('keeps the last valid shared theme, with its error, once a file breaks', async () => {
    const configDir = await writeShared('ocean', JSON.stringify({ base: 'dark' }));
    const source = createSharedConfigSource(configDir);
    await source.read();
    await fs.writeFile(path.join(configDir, 'themes', 'ocean.json'), '{', 'utf-8');
    const boot = await buildPageBoot(dir, source);
    expect(boot.sharedTheme?.theme?.id).toBe('ocean');
    expect(boot.sharedTheme?.error).not.toBeNull();
  });
});

describe('parsePageBoot', () => {
  it('reads nothing from a page without a payload', () => {
    expect(parsePageBoot(undefined)).toBeNull();
    expect(parsePageBoot('')).toBeNull();
    expect(parsePageBoot('{')).toBeNull();
  });
});
