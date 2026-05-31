import { describe, expect, it, vi } from 'vitest';
import type { FileStat, FsAdapter } from './fs-adapter.js';
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
  async list(): Promise<string[]> {
    return [];
  }
  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    return entry === undefined ? null : { lastModified: entry.lastModified };
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
