import { describe, expect, it, vi } from 'vitest';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';
import { ConflictError, createGuardedFs } from './conflicts.js';

class InMemoryFs implements FsAdapter {
  files = new Map<string, { content: string; lastModified: number }>();
  private clock = 1;

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return entry.content;
  }
  async write(path: string, content: string): Promise<void> {
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
    return entry === undefined ? null : { lastModified: entry.lastModified };
  }
  async mkdir(): Promise<void> {}
  async remove(path: string): Promise<void> {
    this.files.delete(path);
    const prefix = `${path}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key);
  }
}

describe('createGuardedFs', () => {
  it('writes a known-unchanged file and updates its recorded version', async () => {
    const inner = new InMemoryFs();
    await inner.write('a.md', 'one');
    const versions: Record<string, number> = { 'a.md': inner.files.get('a.md')!.lastModified };
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    await fs.write('a.md', 'two');

    expect(await inner.read('a.md')).toBe('two');
    expect(versions['a.md']).toBe(inner.files.get('a.md')!.lastModified);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('throws ConflictError and calls onConflict when the file changed on disk', async () => {
    const inner = new InMemoryFs();
    await inner.write('a.md', 'one');
    const versions: Record<string, number> = { 'a.md': inner.files.get('a.md')!.lastModified };
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    // External edit moves the mtime forward.
    inner.files.get('a.md')!.lastModified += 100;

    await expect(fs.write('a.md', 'two')).rejects.toBeInstanceOf(ConflictError);
    expect(onConflict).toHaveBeenCalledWith('a.md');
    expect(await inner.read('a.md')).toBe('one');
  });

  it('allows creating a brand-new file', async () => {
    const inner = new InMemoryFs();
    const versions: Record<string, number> = {};
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    await fs.write('new.md', 'hi');

    expect(await inner.read('new.md')).toBe('hi');
    expect(versions['new.md']).toBe(inner.files.get('new.md')!.lastModified);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('treats an unknown file that already exists on disk as a conflict', async () => {
    const inner = new InMemoryFs();
    await inner.write('surprise.md', 'external');
    const versions: Record<string, number> = {};
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    await expect(fs.write('surprise.md', 'mine')).rejects.toBeInstanceOf(ConflictError);
    expect(onConflict).toHaveBeenCalledWith('surprise.md');
  });
});

describe('createGuardedFs — writeAll', () => {
  it('writes every file and records their versions', async () => {
    const inner = new InMemoryFs();
    await inner.write('a.md', 'one');
    await inner.write('b.md', 'one');
    const versions: Record<string, number> = {
      'a.md': (await inner.stat('a.md'))!.lastModified,
      'b.md': (await inner.stat('b.md'))!.lastModified,
    };
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    await fs.writeAll([
      { path: 'a.md', content: 'two' },
      { path: 'b.md', content: 'two' },
    ]);

    expect(await inner.read('a.md')).toBe('two');
    expect(await inner.read('b.md')).toBe('two');
    expect(versions['a.md']).toBe((await inner.stat('a.md'))!.lastModified);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('writes nothing when any target changed on disk', async () => {
    const inner = new InMemoryFs();
    await inner.write('a.md', 'one');
    await inner.write('b.md', 'one');
    const versions: Record<string, number> = {
      'a.md': (await inner.stat('a.md'))!.lastModified,
      'b.md': (await inner.stat('b.md'))!.lastModified,
    };
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    // Only the second target moved: the first must still not be written.
    await inner.write('b.md', 'external');

    await expect(
      fs.writeAll([
        { path: 'a.md', content: 'mine' },
        { path: 'b.md', content: 'mine' },
      ]),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(onConflict).toHaveBeenCalledWith('b.md');
    expect(await inner.read('a.md')).toBe('one');
    expect(await inner.read('b.md')).toBe('external');
  });

  it('removes a known-unchanged file and forgets its version', async () => {
    const inner = new InMemoryFs();
    await inner.write('docs/a.md', 'one');
    const versions: Record<string, number> = { 'docs/a.md': inner.files.get('docs/a.md')!.lastModified };
    const fs = createGuardedFs(inner, versions, vi.fn());

    await fs.remove('docs/a.md');

    expect(inner.files.has('docs/a.md')).toBe(false);
    expect(versions['docs/a.md']).toBeUndefined();
  });

  it('refuses to remove a file that changed on disk', async () => {
    const inner = new InMemoryFs();
    await inner.write('docs/a.md', 'one');
    const versions: Record<string, number> = { 'docs/a.md': 999 };
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, versions, onConflict);

    await expect(fs.remove('docs/a.md')).rejects.toBeInstanceOf(ConflictError);
    expect(inner.files.has('docs/a.md')).toBe(true);
    expect(onConflict).toHaveBeenCalledWith('docs/a.md');
  });

  it('removeDir deletes a directory that is still empty on disk', async () => {
    const inner = new InMemoryFs();
    const fs = createGuardedFs(inner, {}, vi.fn());

    await expect(fs.removeDir('docs/guides')).resolves.toBeUndefined();
  });

  it('removeDir refuses a directory that gained a file since load', async () => {
    const inner = new InMemoryFs();
    await inner.write('docs/guides/surprise.md', 'appeared externally');
    const onConflict = vi.fn();
    const fs = createGuardedFs(inner, {}, onConflict);

    await expect(fs.removeDir('docs/guides')).rejects.toBeInstanceOf(ConflictError);

    // The file someone else put there survives.
    expect(inner.files.has('docs/guides/surprise.md')).toBe(true);
    expect(onConflict).toHaveBeenCalledWith('docs/guides');
  });
});
