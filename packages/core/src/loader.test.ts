import { describe, expect, it } from 'vitest';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';
import { loadBoard } from './loader.js';

class InMemoryFs implements FsAdapter {
  files = new Map<string, string>();
  dirs = new Set<string>();

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
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
    return this.files.has(path) ? { lastModified: 0 } : null;
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


const CONFIG = `idPrefix: BD
nextId: 5
projectName: My Project
`;

const RELEASE_OK = `---
release: "1.10"
status: current
---

## Task one

---
id: BD-1
type: feature
status: todo
order: 100
---

body
`;

const EPIC_OK = `---
name: Parser
color: "#8957e5"
---

## Epic task

---
id: BD-2
type: tech
status: done
order: 100
---

x
`;

describe('loadBoard', () => {
  it('loads config + releases + epics', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('releases/1.10.md', RELEASE_OK);
    await fs.write('epics/parser.md', EPIC_OK);
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.problems).toEqual([]);
    expect(result.snapshot.config.idPrefix).toBe('BD');
    expect(result.snapshot.releases).toHaveLength(1);
    expect(result.snapshot.epics).toHaveLength(1);
    expect(result.snapshot.epics[0]!.slug).toBe('parser');
    expect(Object.keys(result.fileVersions).sort()).toEqual(
      ['config.yaml', 'epics/parser.md', 'releases/1.10.md'].sort(),
    );
  });

  it('returns missing-config when config.yaml does not exist', async () => {
    const fs = new InMemoryFs();
    const result = await loadBoard(fs);
    expect(result.kind).toBe('missing-config');
  });

  it('returns failed when config fails validation', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', 'idPrefix: BD\n');
    const result = await loadBoard(fs);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected failed');
    expect(result.problems).toHaveLength(1);
  });

  it('returns failed when idPrefix is lowercase', async () => {
    const fs = new InMemoryFs();
    await fs.write(
      'config.yaml',
      `idPrefix: bd
nextId: 1
projectName: Project
`,
    );
    const result = await loadBoard(fs);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') throw new Error('expected failed');
    expect(result.problems[0]!.message).toMatch(/idPrefix/);
  });

  it('treats missing release/epic dirs as empty', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.releases).toEqual([]);
    expect(result.snapshot.epics).toEqual([]);
  });

  it('keeps good files when one is broken (lenient)', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('releases/good.md', RELEASE_OK);
    await fs.write('releases/bad.md', '## Lonely task\n');
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.releases).toHaveLength(1);
    expect(result.problems.some((p) => p.scope === 'file' && p.file.includes('bad.md'))).toBe(true);
  });

  it('bumps nextId when it has fallen behind and writes the config back', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const releaseWithHigherId = RELEASE_OK.replace('id: BD-1', 'id: BD-42');
    await fs.write('releases/1.10.md', releaseWithHigherId);
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.config.nextId).toBe(43);
    const persisted = await fs.read('config.yaml');
    expect(persisted).toContain('nextId: 43');
  });

  it('does not rewrite the config when nextId is already ahead', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('releases/1.10.md', RELEASE_OK);
    const before = await fs.read('config.yaml');
    await loadBoard(fs);
    const after = await fs.read('config.yaml');
    expect(after).toBe(before);
  });

  it('treats missing epics/no_epic.md as null backlog without problems', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.backlog).toBeNull();
    expect(result.problems).toEqual([]);
  });

  it('parses epics/no_epic.md alongside epics without falsely flagging it', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('epics/parser.md', EPIC_OK);
    await fs.write(
      'epics/no_epic.md',
      `## Loose

---
id: BD-3
type: feature
status: todo
order: 200
---

body
`,
    );
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.epics).toHaveLength(1);
    expect(result.snapshot.epics[0]!.slug).toBe('parser');
    expect(result.snapshot.backlog).not.toBeNull();
    expect(result.snapshot.backlog!.tasks).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it('includes backlog tasks when bumping nextId', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write(
      'epics/no_epic.md',
      `## Big one

---
id: BD-7
type: tech
status: todo
order: 100
---

body
`,
    );
    const result = await loadBoard(fs);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.config.nextId).toBe(8);
    expect(result.snapshot.backlog!.tasks).toHaveLength(1);
  });

  it('builds a nested docs tree, ignoring non-markdown files', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('docs/intro.md', '---\ntitle: Intro\n---\n\nHello\n');
    await fs.write('docs/guides/setup.md', '---\ntitle: Setup\n---\n\nSteps\n');
    await fs.write('docs/guides/deep/more.md', 'no frontmatter here');
    await fs.write('docs/diagram.png', 'binary-ish');

    const result = await loadBoard(fs);
    if (result.kind !== 'loaded') throw new Error('expected loaded');

    const docs = result.snapshot.docs;
    expect(docs.pages.map((p) => p.path)).toEqual(['docs/intro.md']);
    expect(docs.folders.map((f) => f.name)).toEqual(['guides']);
    const guides = docs.folders[0]!;
    expect(guides.pages.map((p) => p.path)).toEqual(['docs/guides/setup.md']);
    expect(guides.folders[0]!.pages[0]!.path).toBe('docs/guides/deep/more.md');
    // The .png is not a page, but its name is remembered so nothing overwrites it.
    expect(docs.pages.map((p) => p.path)).not.toContain('docs/diagram.png');
    expect(docs.otherEntries).toEqual(['diagram.png']);
  });

  it('records a version for every doc page, so the first save is guarded', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('docs/intro.md', 'hello');
    await fs.write('docs/guides/setup.md', 'steps');

    const result = await loadBoard(fs);
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.fileVersions).toHaveProperty('docs/intro.md');
    expect(result.fileVersions).toHaveProperty('docs/guides/setup.md');
  });

  it('treats a missing docs dir as an empty tree', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const result = await loadBoard(fs);
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.docs.pages).toEqual([]);
    expect(result.snapshot.docs.folders).toEqual([]);
  });

  it('keeps good pages when one has broken frontmatter, and reports it', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('docs/good.md', '---\ntitle: Good\n---\n\nfine');
    await fs.write('docs/bad.md', '---\ntitle: [unclosed\n---\n\nbroken');

    const result = await loadBoard(fs);
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.docs.pages.map((p) => p.path)).toEqual(['docs/good.md']);
    expect(result.problems.some((p) => p.file === 'docs/bad.md')).toBe(true);
    // Unreadable, but its name is still taken — a new page must not clobber it.
    expect(result.snapshot.docs.otherEntries).toEqual(['bad.md']);
  });

  it('lists an empty folder the user created', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.mkdir('docs/drafts');
    const result = await loadBoard(fs);
    if (result.kind !== 'loaded') throw new Error('expected loaded');
    expect(result.snapshot.docs.folders.map((f) => f.name)).toEqual(['drafts']);
    expect(result.snapshot.docs.folders[0]!.pages).toEqual([]);
  });
});
