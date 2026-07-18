import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeFsAdapter, resolveTarget } from './node-fs';

describe('resolveTarget', () => {
  it('rejects absolute paths', () => {
    expect(resolveTarget('/board', '/etc/passwd')).toBeNull();
  });

  it('rejects `..` escapes', () => {
    expect(resolveTarget('/board', '../secret')).toBeNull();
  });

  it('resolves a nested relative path under the root', () => {
    // resolveTarget uses path.resolve internally, which on Windows prefixes a
    // drive letter — so the expectation must go through resolve() too, not join().
    expect(resolveTarget('/board', 'releases/v1.md')).toBe(resolve('/board', 'releases', 'v1.md'));
  });
});

describe('NodeFsAdapter', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bd-cli-fs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes and reads, creating parent directories', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.write('epics/no_epic.md', 'hello');
    expect(await fs.read('epics/no_epic.md')).toBe('hello');
  });

  it('list returns [] for a missing directory', async () => {
    expect(await new NodeFsAdapter(root).list('releases')).toEqual([]);
  });

  it('list reports files and subdirectories, flagging which is which', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.write('releases/v1.md', 'x');
    await mkdir(join(root, 'releases', 'nested'), { recursive: true });
    const entries = await fs.list('releases');
    expect(entries).toContainEqual({ name: 'v1.md', isDirectory: false });
    expect(entries).toContainEqual({ name: 'nested', isDirectory: true });
  });

  it('mkdir creates a directory that list then reports', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.mkdir('docs/guides');
    expect(await fs.list('docs')).toContainEqual({ name: 'guides', isDirectory: true });
  });

  it('remove deletes a file, and a directory with everything under it', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.write('docs/a.md', 'x');
    await fs.write('docs/guides/b.md', 'y');

    await fs.remove('docs/a.md');
    expect(await fs.stat('docs/a.md')).toBeNull();

    await fs.remove('docs/guides');
    expect(await fs.stat('docs/guides/b.md')).toBeNull();
    expect(await fs.list('docs')).toEqual([]);
  });

  it('remove is a no-op for a path that does not exist', async () => {
    await expect(new NodeFsAdapter(root).remove('docs/missing.md')).resolves.toBeUndefined();
  });

  it('stat returns null for a missing file', async () => {
    expect(await new NodeFsAdapter(root).stat('config.yaml')).toBeNull();
  });

  it('stat returns a lastModified for a present file', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.write('config.yaml', 'x');
    const stat = await fs.stat('config.yaml');
    expect(stat).not.toBeNull();
    expect(typeof stat?.lastModified).toBe('number');
  });

  it('refuses to write outside the board root', async () => {
    await expect(new NodeFsAdapter(root).write('../evil.md', 'x')).rejects.toThrow();
  });
});
