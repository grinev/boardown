import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(resolveTarget('/board', 'releases/v1.md')).toBe(join('/board', 'releases', 'v1.md'));
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

  it('list returns only files, not subdirectories', async () => {
    const fs = new NodeFsAdapter(root);
    await fs.write('releases/v1.md', 'x');
    await mkdir(join(root, 'releases', 'nested'), { recursive: true });
    const names = await fs.list('releases');
    expect(names).toContain('v1.md');
    expect(names).not.toContain('nested');
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
