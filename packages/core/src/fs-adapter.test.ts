import { describe, expect, it } from 'vitest';
import type { FileStat, FsAdapter } from './fs-adapter.js';

class InMemoryFs implements FsAdapter {
  private files = new Map<string, { content: string; lastModified: number }>();

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return entry.content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, { content, lastModified: Date.now() });
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tail = key.slice(prefix.length);
      const slash = tail.indexOf('/');
      out.add(slash === -1 ? tail : tail.slice(0, slash));
    }
    return [...out];
  }

  async stat(path: string): Promise<FileStat | null> {
    const entry = this.files.get(path);
    return entry === undefined ? null : { lastModified: entry.lastModified };
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
    const releases = (await fs.list('releases')).sort();
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
