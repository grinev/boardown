import { describe, expect, it, vi } from 'vitest';
import {
  ATTACHMENT_MAX_BYTES,
  AttachmentTooLargeError,
  addAttachments,
  attachmentProjectPath,
  attachmentWrites,
  listAttachments,
  pickAttachmentNames,
  readAttachment,
  removeAttachment,
  storedAttachmentName,
} from './attachments.js';
import { BoardOpError, type Container } from './board-ops.js';
import { ConflictError, createGuardedFs, type GuardedChange } from './conflicts.js';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';
import type { BoardConfig } from './schemas.js';

const config: BoardConfig = { idPrefix: 'BD', nextId: 10, projectName: 'Test' };

class InMemoryFs implements FsAdapter {
  files = new Map<string, { content: string | Uint8Array; lastModified: number }>();
  private clock = 1;

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof entry.content === 'string' ? entry.content : new TextDecoder().decode(entry.content);
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, { content, lastModified: this.clock++ });
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof entry.content === 'string' ? new TextEncoder().encode(entry.content) : entry.content;
  }
  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    this.files.set(path, { content, lastModified: this.clock++ });
  }
  async list(dir: string): Promise<FsEntry[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out = new Map<string, boolean>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tail = key.slice(prefix.length);
      const slash = tail.indexOf('/');
      out.set(slash === -1 ? tail : tail.slice(0, slash), slash !== -1);
    }
    return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
  }
  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    if (entry === undefined) return null;
    const size = typeof entry.content === 'string' ? entry.content.length : entry.content.byteLength;
    return { lastModified: entry.lastModified, size };
  }
  async mkdir(): Promise<void> {}
  async remove(path: string): Promise<void> {
    this.files.delete(path);
    const prefix = `${path}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key);
  }
}

const container = (status: 'current' | 'finished' = 'current'): Container => ({
  filename: 'releases/1.0.md',
  slug: '1.0',
  frontmatter: { status },
  preamble: '',
  tasks: [],
});

const setup = async () => {
  const inner = new InMemoryFs();
  await inner.write('releases/1.0.md', 'release');
  const versions: Record<string, number> = {
    'releases/1.0.md': inner.files.get('releases/1.0.md')!.lastModified,
  };
  const fs = createGuardedFs(inner, {
    versions,
    problems: [],
    onConflict: vi.fn(),
    onUnreadable: vi.fn(),
  });
  return { inner, fs, commit: (change: GuardedChange) => fs.commit(change) };
};

const bytes = (...values: number[]) => new Uint8Array(values);

describe('storedAttachmentName', () => {
  it('replaces characters a Windows filename cannot hold', () => {
    expect(storedAttachmentName('a:b*c?"<>|\\/.txt')).toBe('a_b_c_______.txt');
  });

  it('suffixes a reserved stem, judged before the first dot', () => {
    expect(storedAttachmentName('CON.txt')).toBe('CON_.txt');
    expect(storedAttachmentName('nul')).toBe('nul_');
    expect(storedAttachmentName('console.log')).toBe('console.log');
  });

  it('drops trailing dots and spaces, and names an empty result', () => {
    expect(storedAttachmentName('notes. . ')).toBe('notes');
    expect(storedAttachmentName('...')).toBe('file');
  });

  it('stores names in NFC', () => {
    expect(storedAttachmentName('café.txt')).toBe('café.txt');
  });
});

describe('pickAttachmentNames', () => {
  it('suffixes before the extension, in pick order, regardless of case', () => {
    expect(pickAttachmentNames(['shot.png', 'shot.png', 'SHOT.png'], ['Shot.png'])).toEqual([
      'shot (1).png',
      'shot (2).png',
      'SHOT (3).png',
    ]);
  });

  it('suffixes a name with no extension at its end', () => {
    expect(pickAttachmentNames(['README', '.env'], ['README', '.env'])).toEqual([
      'README (1)',
      '.env (1)',
    ]);
  });
});

describe('attachments on disk', () => {
  it('lists files only, sorted by name regardless of case, with sizes', async () => {
    const { inner, fs } = await setup();
    await inner.writeBytes('attachments/BD-1/b.png', bytes(1, 2, 3));
    await inner.writeBytes('attachments/BD-1/A.txt', bytes(1));
    await inner.writeBytes('attachments/BD-1/sub/c.txt', bytes(1));
    expect(await listAttachments(fs, 'BD-1')).toEqual([
      { name: 'A.txt', size: 1, path: 'attachments/BD-1/A.txt' },
      { name: 'b.png', size: 3, path: 'attachments/BD-1/b.png' },
    ]);
    expect(await listAttachments(fs, 'BD-2')).toEqual([]);
  });

  it('adds files under suffixed names, never overwriting', async () => {
    const { inner, fs, commit } = await setup();
    await inner.writeBytes('attachments/BD-1/shot.png', bytes(9));
    const names = await addAttachments(fs, commit, container(), config, 'BD-1', [
      { name: 'shot.png', content: bytes(0, 255) },
      { name: 'shot.png', content: bytes(1) },
    ]);
    expect(names).toEqual(['shot (1).png', 'shot (2).png']);
    expect(await inner.readBytes('attachments/BD-1/shot.png')).toEqual(bytes(9));
    expect(await inner.readBytes('attachments/BD-1/shot (1).png')).toEqual(bytes(0, 255));
  });

  it('refuses a file over the cap, writing nothing', async () => {
    const { inner, fs, commit } = await setup();
    const big = { name: 'big.zip', content: new Uint8Array(ATTACHMENT_MAX_BYTES + 1) };
    const small = { name: 'ok.txt', content: bytes(1) };
    await expect(
      addAttachments(fs, commit, container(), config, 'BD-1', [small, big]),
    ).rejects.toBeInstanceOf(AttachmentTooLargeError);
    expect(inner.files.has('attachments/BD-1/ok.txt')).toBe(false);
  });

  it('accepts a file exactly at the cap', async () => {
    const { fs } = await setup();
    const { names } = await attachmentWrites(fs, 'BD-1', [
      { name: 'edge.bin', content: new Uint8Array(ATTACHMENT_MAX_BYTES) },
    ]);
    expect(names).toEqual(['edge.bin']);
  });

  it('refuses adding and removing in a finished release', async () => {
    const { inner, fs, commit } = await setup();
    await inner.writeBytes('attachments/BD-1/a.txt', bytes(1));
    const done = container('finished');
    await expect(
      addAttachments(fs, commit, done, config, 'BD-1', [{ name: 'x', content: bytes(1) }]),
    ).rejects.toBeInstanceOf(BoardOpError);
    await expect(removeAttachment(fs, commit, done, config, 'BD-1', 'a.txt')).rejects.toBeInstanceOf(
      BoardOpError,
    );
    expect(inner.files.has('attachments/BD-1/a.txt')).toBe(true);
  });

  it('adds and removes in a finished release when the board lifts the freeze', async () => {
    const { inner, fs, commit } = await setup();
    await inner.writeBytes('attachments/BD-1/a.txt', bytes(1));
    const done = container('finished');
    const unfrozen: BoardConfig = { ...config, editFinishedReleases: true };
    expect(
      await addAttachments(fs, commit, done, unfrozen, 'BD-1', [{ name: 'x', content: bytes(1) }]),
    ).toEqual(['x']);
    expect(await removeAttachment(fs, commit, done, unfrozen, 'BD-1', 'a.txt')).toBe(true);
    expect(inner.files.has('attachments/BD-1/x')).toBe(true);
    expect(inner.files.has('attachments/BD-1/a.txt')).toBe(false);
  });

  it('refuses when the file holding the task changed on disk since load', async () => {
    const { inner, fs, commit } = await setup();
    await inner.write('releases/1.0.md', 'completed elsewhere');
    await expect(
      addAttachments(fs, commit, container(), config, 'BD-1', [{ name: 'x', content: bytes(1) }]),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(inner.files.has('attachments/BD-1/x')).toBe(false);
  });

  it('removes a file, and the folder with its last file', async () => {
    const { inner, fs, commit } = await setup();
    await inner.writeBytes('attachments/BD-1/a.txt', bytes(1));
    await inner.writeBytes('attachments/BD-1/b.txt', bytes(1));
    expect(await removeAttachment(fs, commit, container(), config, 'BD-1', 'a.txt')).toBe(true);
    expect(await inner.list('attachments/BD-1')).toEqual([{ name: 'b.txt', isDirectory: false }]);
    expect(await removeAttachment(fs, commit, container(), config, 'BD-1', 'b.txt')).toBe(true);
    expect(await inner.list('attachments')).toEqual([]);
  });

  it('reports a name that is not there, writing nothing', async () => {
    const { fs, commit } = await setup();
    const spy = vi.fn(commit);
    expect(await removeAttachment(fs, spy, container(), config, 'BD-1', 'gone.png')).toBe(false);
    expect(await removeAttachment(fs, spy, container(), config, 'BD-1', '../BD-2/a.txt')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads bytes back, or null when the file is gone', async () => {
    const { inner, fs } = await setup();
    await inner.writeBytes('attachments/BD-1/a.bin', bytes(0, 1));
    expect(await readAttachment(fs, 'BD-1', 'a.bin')).toEqual(bytes(0, 1));
    expect(await readAttachment(fs, 'BD-1', 'b.bin')).toBeNull();
  });

  it('builds the project path the repo file popup opens', () => {
    expect(attachmentProjectPath('BD-1', 'shot.png')).toBe('.boardown/attachments/BD-1/shot.png');
  });
});
