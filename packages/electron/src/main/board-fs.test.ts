import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFsRequest, resolveTarget } from './board-fs';

const ROOT = path.resolve('/tmp/boardown-test/.boardown');

describe('resolveTarget', () => {
  it('joins a simple relative path onto the board root', () => {
    expect(resolveTarget(ROOT, 'config.yaml')).toBe(path.join(ROOT, 'config.yaml'));
  });

  it('joins a nested relative path', () => {
    expect(resolveTarget(ROOT, 'releases/2025-01.md')).toBe(
      path.join(ROOT, 'releases', '2025-01.md'),
    );
  });

  it('normalizes backslashes to the path separator', () => {
    expect(resolveTarget(ROOT, 'releases\\2025-01.md')).toBe(
      path.join(ROOT, 'releases', '2025-01.md'),
    );
  });

  it('rejects an absolute POSIX path', () => {
    expect(resolveTarget(ROOT, '/etc/passwd')).toBeNull();
  });

  it('rejects a Windows drive-letter path', () => {
    expect(resolveTarget(ROOT, 'C:\\Windows\\system32')).toBeNull();
  });

  it('rejects traversal that escapes the board root', () => {
    expect(resolveTarget(ROOT, '../../../etc/passwd')).toBeNull();
  });

  it('rejects traversal embedded in an otherwise relative path', () => {
    expect(resolveTarget(ROOT, 'releases/../../secret')).toBeNull();
  });

  it('rejects a leading-".." literal — percent-encoding is no bypass', () => {
    expect(resolveTarget(ROOT, '..%2F..%2Fsecret')).toBeNull();
  });
});

describe('handleFsRequest', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'boardown-fs-'));
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('write creates parent directories, then read returns the content', async () => {
    await handleFsRequest(root, { method: 'write', path: 'releases/r.md', content: 'hi' });
    expect(await handleFsRequest(root, { method: 'read', path: 'releases/r.md' })).toBe('hi');
  });

  it('list returns [] for a missing directory', async () => {
    expect(await handleFsRequest(root, { method: 'list', path: 'releases' })).toEqual([]);
  });

  it('list reports files and subdirectories, flagging which is which', async () => {
    await handleFsRequest(root, { method: 'write', path: 'releases/a.md', content: 'a' });
    await fsp.mkdir(path.join(root, 'releases', 'sub'), { recursive: true });
    expect(await handleFsRequest(root, { method: 'list', path: 'releases' })).toEqual([
      { name: 'a.md', isDirectory: false },
      { name: 'sub', isDirectory: true },
    ]);
  });

  it('mkdir creates an empty directory that list then reports', async () => {
    await handleFsRequest(root, { method: 'mkdir', path: 'docs/drafts' });
    expect(await handleFsRequest(root, { method: 'list', path: 'docs' })).toEqual([
      { name: 'drafts', isDirectory: true },
    ]);
  });

  it('remove deletes a file, and a directory with everything under it', async () => {
    await handleFsRequest(root, { method: 'write', path: 'docs/a.md', content: 'a' });
    await handleFsRequest(root, { method: 'write', path: 'docs/sub/b.md', content: 'b' });

    await handleFsRequest(root, { method: 'remove', path: 'docs/a.md' });
    expect(await handleFsRequest(root, { method: 'stat', path: 'docs/a.md' })).toBeNull();

    await handleFsRequest(root, { method: 'remove', path: 'docs/sub' });
    expect(await handleFsRequest(root, { method: 'list', path: 'docs' })).toEqual([]);
  });

  it('remove refuses a path escaping the board root', async () => {
    await expect(
      handleFsRequest(root, { method: 'remove', path: '../outside.md' }),
    ).rejects.toThrow(/Invalid path/);
  });

  it('read returns null for a missing file (preload reconstructs the error)', async () => {
    expect(await handleFsRequest(root, { method: 'read', path: 'config.yaml' })).toBeNull();
  });

  it('stat returns null for a missing file', async () => {
    expect(await handleFsRequest(root, { method: 'stat', path: 'config.yaml' })).toBeNull();
  });

  it('stat returns a numeric lastModified for an existing file', async () => {
    await handleFsRequest(root, { method: 'write', path: 'config.yaml', content: 'x' });
    const stat = (await handleFsRequest(root, {
      method: 'stat',
      path: 'config.yaml',
    })) as { lastModified: number } | null;
    expect(typeof stat?.lastModified).toBe('number');
  });

  it('throws on a path that escapes the board root', async () => {
    await expect(
      handleFsRequest(root, { method: 'read', path: '../escape' }),
    ).rejects.toThrow(/Invalid path/);
  });

  it('calls onWrite with the absolute path on write, and never on read/stat/list', async () => {
    const onWrite = vi.fn();
    await handleFsRequest(root, { method: 'write', path: 'releases/r.md', content: 'hi' }, onWrite);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite).toHaveBeenCalledWith(path.join(root, 'releases', 'r.md'));

    onWrite.mockClear();
    await handleFsRequest(root, { method: 'read', path: 'releases/r.md' }, onWrite);
    await handleFsRequest(root, { method: 'stat', path: 'releases/r.md' }, onWrite);
    await handleFsRequest(root, { method: 'list', path: 'releases' }, onWrite);
    expect(onWrite).not.toHaveBeenCalled();
  });
});
