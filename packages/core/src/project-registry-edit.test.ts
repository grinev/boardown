import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendRegistrations, dropRegistration } from './project-registry-edit.js';
import { parseProjectRegistry, type ProjectRegistration } from './project-registry.js';

const isAbsolute = (value: string) => path.isAbsolute(value);
const entries = (text: string): ProjectRegistration[] => {
  const parsed = parseProjectRegistry(text, isAbsolute);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.entries;
};

const addEntry = (
  text: string | null,
  current: ProjectRegistration[],
  id: string,
  projectRoot: string,
) => appendRegistrations(text, current, [{ id, projectRoot }], isAbsolute);
const removeEntry = (text: string, current: ProjectRegistration[], id: string) =>
  dropRegistration(text, current, id, isAbsolute);

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
    const before =
      'projects:\n  # the shop\n  shop: /projects/shop\n\n  # the site\n  site: /projects/site\n';
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
    expect(result).toMatchObject({ ok: false });
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
    expect(entries(after)[0]?.projectRoot).toBe(folder);
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

it('adds a complete migration in one patch without changing earlier lines', () => {
  const before = '# original\nprojects:\n  shop: /projects/shop\n';
  const result = appendRegistrations(
    before,
    entries(before),
    [
      { id: 'a', projectRoot: A },
      { id: 'b', projectRoot: B },
    ],
    isAbsolute,
  );
  expect(result).toEqual({ ok: true, text: `${before}  a: ${A}\n  b: ${B}\n` });
});
