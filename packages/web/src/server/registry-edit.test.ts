import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addEntry, removeEntry, validateAdd } from './registry-edit';
import { parseRegistry, type RegistryEntry } from './registry';
import { rootsFromProjectFolder } from './roots';

const made: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-registry-edit-'));
  made.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const entries = (text: string): RegistryEntry[] => {
  const parsed = parseRegistry(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.entries;
};

const added = (text: string, id: string, folder: string): string => {
  const result = addEntry(text, entries(text), id, folder);
  if (!result.ok) throw new Error(result.message);
  return result.text;
};

const removed = (text: string, id: string): string => {
  const result = removeEntry(text, entries(text), id);
  if (!result.ok) throw new Error(result.message);
  return result.text;
};

const A = path.resolve('/projects/a');
const B = path.resolve('/projects/b');

describe('addEntry', () => {
  it('appends one line and leaves every other byte alone', () => {
    const before = '# my projects\nprojects:\n  shop: /projects/shop\n';
    const after = added(before, 'blog', B);
    expect(after).toBe(`# my projects\nprojects:\n  shop: /projects/shop\n  blog: ${B}\n`);
  });

  it('keeps comments and blank lines inside the block', () => {
    const before = 'projects:\n  # the shop\n  shop: /projects/shop\n\n  # the site\n  site: /projects/site\n';
    const after = added(before, 'blog', B);
    expect(after).toContain('# the shop');
    expect(after).toContain('# the site');
    expect(after.indexOf('blog:')).toBeGreaterThan(after.indexOf('site:'));
  });

  it('appends after the last entry, before anything below the block', () => {
    const before = 'projects:\n  shop: /projects/shop\n# a trailing note\n';
    const after = added(before, 'blog', B);
    expect(after.indexOf('blog:')).toBeLessThan(after.indexOf('# a trailing note'));
  });

  it('writes the whole file when there is none yet', () => {
    const result = addEntry(null, [], 'shop', A);
    expect(result).toMatchObject({ ok: true, text: `projects:\n  shop: ${A}\n` });
  });

  it('turns an empty flow mapping into a block, keeping its comment', () => {
    const after = added('projects: {} # nothing yet\n', 'shop', A);
    expect(after).toBe(`projects: # nothing yet\n  shop: ${A}\n`);
    expect(entries(after)).toHaveLength(1);
  });

  it('refuses a flow mapping that has entries in it', () => {
    const before = 'projects: {shop: /projects/shop}\n';
    const result = addEntry(before, entries(before), 'blog', B);
    expect(result).toMatchObject({ ok: false, field: null });
  });

  it('keeps the indentation the file already uses', () => {
    const after = added('projects:\n    shop: /projects/shop\n', 'blog', B);
    expect(after).toContain(`\n    blog: ${B}\n`);
  });

  it('keeps a CRLF file on CRLF', () => {
    const after = added('projects:\r\n  shop: /projects/shop\r\n', 'blog', B);
    expect(after).toBe(`projects:\r\n  shop: /projects/shop\r\n  blog: ${B}\r\n`);
    expect(entries(after)).toHaveLength(2);
  });

  it('adds to a file that does not end in a newline', () => {
    const after = added('projects:\n  shop: /projects/shop', 'blog', B);
    expect(entries(after).map((entry) => entry.id)).toEqual(['shop', 'blog']);
  });

  it('quotes a path that YAML would otherwise read as something else', () => {
    const folder = path.resolve('/projects/#hash: odd');
    const after = added('projects: {}\n', 'odd', folder);
    expect(entries(after)[0]?.projectRoot).toBe(folder);
  });

  // A backslash is ordinary in a path only on the platform whose paths carry
  // them: on POSIX a Windows path is not an absolute path at all, and the
  // parser refuses it long before the writer's quoting is what is being tested.
  // So the case is written with a path the platform running it actually has.
  it('writes a path carrying backslashes so that it reads back unchanged', () => {
    const folder = process.platform === 'win32' ? 'C:\\Users\\me\\shop' : '/projects/a\\b';
    const after = added('projects: {}\n', 'shop', folder);
    expect(entries(after)[0]?.projectRoot).toBe(rootsFromProjectFolder(folder).projectRoot);
  });

  it('takes an id of digits alone, which the parser reads back before the rest', () => {
    const after = added('projects:\n  shop: /projects/shop\n', '2024', B);
    expect(after).toBe(`projects:\n  shop: /projects/shop\n  "2024": ${B}\n`);
    expect(entries(after)).toHaveLength(2);
  });

  it('keeps a CRLF file that does not end in a newline on CRLF', () => {
    const after = added('projects:\r\n  shop: /projects/shop', 'blog', B);
    expect(after).toBe(`projects:\r\n  shop: /projects/shop\r\n  blog: ${B}`);
    expect(entries(after)).toHaveLength(2);
  });

  it('finds the block when projects is not the first key', () => {
    const before = '# header\n\nprojects:\n  shop: /projects/shop\n';
    expect(entries(added(before, 'blog', B)).map((entry) => entry.id)).toEqual(['shop', 'blog']);
  });
});

describe('removeEntry', () => {
  it('deletes one line and leaves the rest alone', () => {
    const before = '# mine\nprojects:\n  shop: /projects/shop\n  blog: /projects/blog\n';
    expect(removed(before, 'shop')).toBe('# mine\nprojects:\n  blog: /projects/blog\n');
  });

  it('leaves an empty mapping behind rather than a key with no value', () => {
    const after = removed('projects:\n  shop: /projects/shop\n', 'shop');
    expect(entries(after)).toEqual([]);
    expect(after).toContain('projects: {}');
  });

  it('keeps the comment on the key line when the block empties', () => {
    const after = removed('projects: # mine\n  shop: /projects/shop\n', 'shop');
    expect(after).toBe('projects: {} # mine\n');
  });

  it('keeps a CRLF file on CRLF when the block empties', () => {
    const after = removed('projects:\r\n  shop: /projects/shop\r\n', 'shop');
    expect(after).toBe('projects: {}\r\n');
    expect(entries(after)).toEqual([]);
  });

  it('leaves no dangling line ending when the last line of a CRLF file goes', () => {
    const before = 'projects:\r\n  shop: /projects/shop\r\n  blog: /projects/blog';
    expect(removed(before, 'blog')).toBe('projects:\r\n  shop: /projects/shop');
  });

  it('empties a CRLF block that does not end in a newline', () => {
    const after = removed('projects:\r\n  shop: /projects/shop', 'shop');
    expect(after).toBe('projects: {}');
    expect(entries(after)).toEqual([]);
  });

  it('matches a quoted key', () => {
    const before = "projects:\n  'shop': /projects/shop\n  blog: /projects/blog\n";
    expect(entries(removed(before, 'shop')).map((entry) => entry.id)).toEqual(['blog']);
  });

  it('refuses when the id has no line of its own', () => {
    const before = 'projects: {shop: /projects/shop}\n';
    expect(removeEntry(before, entries(before), 'shop')).toMatchObject({ ok: false });
  });
});

describe('validateAdd', () => {
  const registered = (folder: string, id = 'taken'): RegistryEntry[] => [
    { id, ...rootsFromProjectFolder(folder) },
  ];

  it('accepts an existing folder under a fresh id', async () => {
    const dir = await tempDir();
    await expect(validateAdd([], dir, 'shop')).resolves.toMatchObject({ ok: true, id: 'shop' });
  });

  it('refuses a blank path at the path field', async () => {
    await expect(validateAdd([], '   ', 'shop')).resolves.toMatchObject({
      ok: false,
      field: 'path',
    });
  });

  it('refuses a relative path at the path field', async () => {
    await expect(validateAdd([], 'projects/shop', 'shop')).resolves.toMatchObject({
      ok: false,
      field: 'path',
    });
  });

  it('refuses a path that names nothing', async () => {
    const dir = await tempDir();
    await expect(validateAdd([], path.join(dir, 'nope'), 'shop')).resolves.toMatchObject({
      ok: false,
      field: 'path',
      message: 'There is no folder at that path.',
    });
  });

  it('refuses a path that names a file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'notes.txt');
    await fs.writeFile(file, 'x', 'utf-8');
    await expect(validateAdd([], file, 'shop')).resolves.toMatchObject({
      ok: false,
      field: 'path',
      message: 'That path is not a folder.',
    });
  });

  it('refuses a folder already registered, however it was typed', async () => {
    const dir = await tempDir();
    const typed = path.join(dir, 'sub', '..', '.');
    await expect(validateAdd(registered(dir), typed, 'other')).resolves.toMatchObject({
      ok: false,
      field: 'path',
      message: 'Already registered as "taken".',
    });
  });

  it('refuses a blank id at the id field', async () => {
    const dir = await tempDir();
    await expect(validateAdd([], dir, ' ')).resolves.toMatchObject({ ok: false, field: 'id' });
  });

  it('refuses an id that is not a URL segment', async () => {
    const dir = await tempDir();
    await expect(validateAdd([], dir, 'My Shop')).resolves.toMatchObject({
      ok: false,
      field: 'id',
    });
  });

  it('refuses an id already in the registry', async () => {
    const dir = await tempDir();
    await expect(validateAdd(registered(path.resolve('/elsewhere')), dir, 'taken')).resolves.toMatchObject({
      ok: false,
      field: 'id',
      message: 'That id is already in the registry.',
    });
  });

  it('reports the path before the id when both are wrong', async () => {
    await expect(validateAdd([], 'relative', 'Not An Id')).resolves.toMatchObject({
      ok: false,
      field: 'path',
    });
  });
});
