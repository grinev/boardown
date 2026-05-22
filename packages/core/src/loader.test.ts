import { describe, expect, it } from 'vitest';
import type { FileStat, FsAdapter } from './fs-adapter.js';
import { loadBoard } from './loader.js';

class InMemoryFs implements FsAdapter {
  files = new Map<string, string>();

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
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
    return this.files.has(path) ? { lastModified: 0 } : null;
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
    expect(result.value).not.toBeNull();
    expect(result.problems).toEqual([]);
    expect(result.value!.config.idPrefix).toBe('BD');
    expect(result.value!.releases).toHaveLength(1);
    expect(result.value!.epics).toHaveLength(1);
    expect(result.value!.epics[0]!.slug).toBe('parser');
  });

  it('returns a file problem when config is missing', async () => {
    const fs = new InMemoryFs();
    const result = await loadBoard(fs);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('file');
  });

  it('returns a file problem when config fails validation', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', 'idPrefix: BD\n');
    const result = await loadBoard(fs);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
  });

  it('treats missing release/epic dirs as empty', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const result = await loadBoard(fs);
    expect(result.value).not.toBeNull();
    expect(result.value!.releases).toEqual([]);
    expect(result.value!.epics).toEqual([]);
  });

  it('keeps good files when one is broken (lenient)', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    await fs.write('releases/good.md', RELEASE_OK);
    await fs.write('releases/bad.md', '## Lonely task\n');
    const result = await loadBoard(fs);
    expect(result.value).not.toBeNull();
    expect(result.value!.releases).toHaveLength(1);
    expect(result.problems.some((p) => p.scope === 'file' && p.file.includes('bad.md'))).toBe(true);
  });

  it('bumps nextId when it has fallen behind and writes the config back', async () => {
    const fs = new InMemoryFs();
    await fs.write('config.yaml', CONFIG);
    const releaseWithHigherId = RELEASE_OK.replace('id: BD-1', 'id: BD-42');
    await fs.write('releases/1.10.md', releaseWithHigherId);
    const result = await loadBoard(fs);
    expect(result.value).not.toBeNull();
    expect(result.value!.config.nextId).toBe(43);
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
    expect(result.value).not.toBeNull();
    expect(result.value!.backlog).toBeNull();
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
    expect(result.value).not.toBeNull();
    expect(result.value!.epics).toHaveLength(1);
    expect(result.value!.epics[0]!.slug).toBe('parser');
    expect(result.value!.backlog).not.toBeNull();
    expect(result.value!.backlog!.tasks).toHaveLength(1);
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
    expect(result.value).not.toBeNull();
    expect(result.value!.config.nextId).toBe(8);
    expect(result.value!.backlog!.tasks).toHaveLength(1);
  });
});
