import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile, resolveProjectTarget } from './project-file';

const ROOT = path.resolve('/tmp/boardown-test');

describe('resolveProjectTarget', () => {
  it('joins a nested relative path onto the project root', () => {
    expect(resolveProjectTarget(ROOT, 'packages/cli/src/app.ts')).toBe(
      path.join(ROOT, 'packages', 'cli', 'src', 'app.ts'),
    );
  });

  it('normalizes backslashes to the path separator', () => {
    expect(resolveProjectTarget(ROOT, 'packages\\cli\\app.ts')).toBe(
      path.join(ROOT, 'packages', 'cli', 'app.ts'),
    );
  });

  it('reaches into the board directory like any other folder', () => {
    expect(resolveProjectTarget(ROOT, '.boardown/config.yaml')).toBe(
      path.join(ROOT, '.boardown', 'config.yaml'),
    );
  });

  it('rejects an absolute POSIX path', () => {
    expect(resolveProjectTarget(ROOT, '/etc/passwd')).toBeNull();
  });

  it('rejects a Windows drive-letter path', () => {
    expect(resolveProjectTarget(ROOT, 'C:\\Windows\\win.ini')).toBeNull();
  });

  it('rejects traversal that escapes the project root', () => {
    expect(resolveProjectTarget(ROOT, '../../etc/passwd')).toBeNull();
    expect(resolveProjectTarget(ROOT, 'packages/../../secret')).toBeNull();
  });

  it('rejects the project root itself', () => {
    expect(resolveProjectTarget(ROOT, '.')).toBeNull();
    expect(resolveProjectTarget(ROOT, '')).toBeNull();
  });
});

describe('readProjectFile', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'boardown-project-'));
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('reads a text file', async () => {
    await fsp.writeFile(path.join(root, 'notes.txt'), 'hello\nworld\n', 'utf-8');
    expect(await readProjectFile(root, 'notes.txt')).toEqual({
      kind: 'text',
      text: 'hello\nworld\n',
    });
  });

  it('reports a missing file', async () => {
    expect(await readProjectFile(root, 'nope.txt')).toEqual({ kind: 'not-found' });
  });

  it('refuses a directory', async () => {
    await fsp.mkdir(path.join(root, 'src'));
    expect(await readProjectFile(root, 'src')).toEqual({ kind: 'unreadable' });
  });

  it('refuses a path escaping the project root without touching disk', async () => {
    expect(await readProjectFile(root, '../../etc/passwd')).toEqual({ kind: 'unreadable' });
  });

  it('reports a binary file as unsupported', async () => {
    await fsp.writeFile(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x1a]));
    expect(await readProjectFile(root, 'logo.png')).toEqual({ kind: 'binary' });
  });
});
