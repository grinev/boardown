import { describe, expect, it } from 'vitest';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';

class InMemoryFs implements FsAdapter {
  private files = new Map<string, { content: string; lastModified: number }>();
  private dirs = new Set<string>();

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return entry.content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, { content, lastModified: Date.now() });
  }

  async list(dir: string): Promise<FsEntry[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out = new Map<string, boolean>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tail = key.slice(prefix.length);
      const slash = tail.indexOf('/');
      if (slash === -1) out.set(tail, false);
      else out.set(tail.slice(0, slash), true);
    }
    for (const d of this.dirs) {
      if (!d.startsWith(prefix)) continue;
      const tail = d.slice(prefix.length);
      const slash = tail.indexOf('/');
      out.set(slash === -1 ? tail : tail.slice(0, slash), true);
    }
    return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    return entry === undefined ? null : { lastModified: entry.lastModified };
  }

  async mkdir(dir: string): Promise<void> {
    this.dirs.add(dir);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.dirs.delete(path);
    const prefix = `${path}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key);
    for (const d of [...this.dirs]) if (d.startsWith(prefix)) this.dirs.delete(d);
  }
}

describe('FsAdapter (in-memory reference impl)', () => {
  it('round-trips read/write', async () => {
    const fs: FsAdapter = new InMemoryFs();
    await fs.write('config.yaml', 'idPrefix: BD');
    expect(await fs.read('config.yaml')).toBe('idPrefix: BD');
  });

  it('list returns one-level entries inside a directory', async () => {
    const fs: FsAdapter = new InMemoryFs();
    await fs.write('releases/1.10.md', 'a');
    await fs.write('releases/1.11.md', 'b');
    await fs.write('epics/parser.md', 'c');
    const releases = (await fs.list('releases')).map((e) => e.name).sort();
    expect(releases).toEqual(['1.10.md', '1.11.md']);
  });

  it('stat returns null for missing files', async () => {
    const fs: FsAdapter = new InMemoryFs();
    expect(await fs.stat('missing.md')).toBeNull();
    await fs.write('here.md', 'x');
    const stat = await fs.stat('here.md');
    expect(stat).not.toBeNull();
    expect(typeof stat!.lastModified).toBe('number');
  });
});
