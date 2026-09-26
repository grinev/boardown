import { describe, expect, it, vi } from 'vitest';
import { createGuardedFs } from './conflicts.js';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';
import { createConvertingFs } from './layout.js';
import { loadBoard, type LoadBoardResult } from './loader.js';
import { parseBacklog } from './parser.js';

class InMemoryFs implements FsAdapter {
  files = new Map<string, { content: string; lastModified: number }>();
  failWrites: string | null = null;
  private clock = 1;

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`ENOENT: ${path}`);
    return entry.content;
  }
  async write(path: string, content: string): Promise<void> {
    if (this.failWrites !== null && path === this.failWrites) throw new Error('disk full');
    this.files.set(path, { content, lastModified: this.clock++ });
  }
  async list(dir: string): Promise<FsEntry[]> {
    const prefix = `${dir}/`;
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
    if (this.failWrites !== null && path === this.failWrites) throw new Error('disk full');
    this.files.delete(path);
  }
  text(path: string): string | undefined {
    return this.files.get(path)?.content;
  }
}

const CONFIG = 'idPrefix: BD\nnextId: 20\nprojectName: P\n';

const PARSER_HEAD = `---
name: Parser
color: "#8957e5"
---

Everything about   parsing.`;

const PARSER = `${PARSER_HEAD}

## Tokenizer

---
id: BD-2
type: tech
status: todo
order: 300
checklist:
  - id: c1
    text: lex
    done: false
reporter: ann
---

Split the input.

## Grammar

---
id: BD-4
type: tech
status: todo
order: 100
---
`;

const UI = `---
name: UI
color: "#1f6feb"
---

## Buttons

---
id: BD-5
type: feature
status: todo
order: 200
---
`;

const NO_EPIC = `---
{}
---

Loose ends live here.

## Loose

---
id: BD-3
type: bug
status: todo
epic: stale
order: 150
---
`;

const board = async (files: Record<string, string>): Promise<InMemoryFs> => {
  const fs = new InMemoryFs();
  await fs.write('config.yaml', CONFIG);
  for (const [path, content] of Object.entries(files)) await fs.write(path, content);
  return fs;
};

const loaded = async (fs: FsAdapter): Promise<Extract<LoadBoardResult, { kind: 'loaded' }>> => {
  const result = await loadBoard(fs);
  if (result.kind !== 'loaded') throw new Error(`expected loaded, got ${result.kind}`);
  return result;
};

const open = async (fs: InMemoryFs) => {
  const result = await loaded(fs);
  const onConflict = vi.fn();
  const onUnreadable = vi.fn();
  const guarded = createGuardedFs(fs, {
    versions: result.fileVersions,
    problems: result.problems,
    onConflict,
    onUnreadable,
  });
  const converting = createConvertingFs(guarded, result.conversion, () => result.snapshot.backlog);
  return { result, fs: converting, onConflict, onUnreadable };
};

const ids = (text: string | undefined): string[] =>
  parseBacklog(text ?? '', 'backlog.md').value!.tasks.map((t) => t.frontmatter.id);

describe('the layout conversion, on load', () => {
  it('gathers every old-layout task into the backlog in display order, epic from the file', async () => {
    const { result } = await open(
      await board({ 'epics/parser.md': PARSER, 'epics/ui.md': UI, 'epics/no_epic.md': NO_EPIC }),
    );
    const tasks = result.snapshot.backlog!.tasks;
    expect(tasks.map((t) => [t.frontmatter.id, t.frontmatter.epic])).toEqual([
      ['BD-4', 'parser'],
      ['BD-3', undefined],
      ['BD-5', 'ui'],
      ['BD-2', 'parser'],
    ]);
    expect(result.snapshot.backlog!.preamble).toBe('Loose ends live here.');
    expect(result.snapshot.epics.map((e) => e.slug)).toEqual(['parser', 'ui']);
  });

  it('asks for nothing on a board already in the current layout', async () => {
    const { result } = await open(
      await board({ 'epics/ui.md': '---\nname: UI\ncolor: "#1f6feb"\n---\n', 'backlog.md': '' }),
    );
    expect(result.conversion).toBeNull();
  });
});

describe('the layout conversion, on the first write', () => {
  it('lands with a write that touches none of the files it moves', async () => {
    const disk = await board({
      'epics/parser.md': PARSER,
      'epics/ui.md': UI,
      'epics/no_epic.md': NO_EPIC,
      'backlog.md': 'Already here.\n\n## Old\n\n---\nid: BD-1\ntype: tech\nstatus: todo\norder: 50\n---\n',
    });
    const { fs } = await open(disk);

    await fs.write('docs/page.md', 'hello\n');

    expect(disk.text('docs/page.md')).toBe('hello\n');
    expect(disk.text('epics/parser.md')).toBe(`${PARSER_HEAD}\n`);
    expect(disk.text('epics/ui.md')).toBe('---\nname: UI\ncolor: "#1f6feb"\n---\n');
    expect(disk.files.has('epics/no_epic.md')).toBe(false);
    const backlog = disk.text('backlog.md')!;
    expect(ids(backlog)).toEqual(['BD-1', 'BD-4', 'BD-3', 'BD-5', 'BD-2']);
    expect(backlog.startsWith('Already here.\n\nLoose ends live here.\n\n## Old')).toBe(true);
    // Every other key boardown reads and the description travel as they were; a
    // key it does not know (`reporter` here, undeclared) is dropped, as on any write.
    expect(backlog).toContain(`## Tokenizer

---
id: BD-2
type: tech
status: todo
epic: parser
order: 300
checklist:
  - id: c1
    text: lex
    done: false
---

Split the input.`);
    expect(backlog).not.toContain('epic: stale');
  });

  it('lets the operation\'s own backlog.md win and is dropped once landed', async () => {
    const disk = await board({ 'epics/parser.md': PARSER });
    const { fs, result } = await open(disk);
    const withNew = {
      ...result.snapshot.backlog!,
      tasks: [
        ...result.snapshot.backlog!.tasks,
        {
          title: 'New',
          description: '',
          frontmatter: { id: 'BD-9', type: 'tech', status: 'todo', epic: 'ui', order: 400 },
        },
      ],
    };
    const { serializeBacklog } = await import('./serializer.js');
    await fs.write('backlog.md', serializeBacklog(withNew));

    expect(ids(disk.text('backlog.md'))).toEqual(['BD-4', 'BD-2', 'BD-9']);
    expect(disk.text('epics/parser.md')).toBe(`${PARSER_HEAD}\n`);
    expect(fs.sourceOf(result.snapshot.backlog!.tasks[0]!)).toBeUndefined();

    // A second write carries nothing more.
    await fs.write('docs/a.md', 'x\n');
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-4', 'BD-2', 'BD-9']);
  });

  it('says where a gathered task still sits until it lands', async () => {
    const { fs, result } = await open(await board({ 'epics/parser.md': PARSER }));
    expect(fs.sourceOf(result.snapshot.backlog!.tasks[0]!)).toBe('epics/parser.md');
  });

  it('is refused whole on an external change to any file it touches, and kept pending', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'epics/no_epic.md': NO_EPIC });
    const { fs, onConflict } = await open(disk);
    await disk.write('epics/no_epic.md', NO_EPIC.replace('Loose', 'Edited'));

    await expect(fs.write('docs/a.md', 'x\n')).rejects.toThrow(/changed on disk/);
    expect(onConflict).toHaveBeenCalledWith('epics/no_epic.md');
    expect(disk.files.has('docs/a.md')).toBe(false);
    expect(disk.files.has('backlog.md')).toBe(false);
    expect(disk.text('epics/parser.md')).toBe(PARSER);
  });

  it('is refused whole when a file it touches was deleted since load', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'epics/no_epic.md': NO_EPIC });
    const { fs, onConflict } = await open(disk);
    await disk.remove('epics/no_epic.md');

    await expect(fs.write('docs/a.md', 'x\n')).rejects.toThrow(/changed on disk/);
    expect(onConflict).toHaveBeenCalledWith('epics/no_epic.md');
    expect(disk.files.has('backlog.md')).toBe(false);
    expect(disk.text('epics/parser.md')).toBe(PARSER);
  });

  it('writes backlog.md, then the operation\'s own files, then the cuts, then removes', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'epics/no_epic.md': NO_EPIC });
    const { fs } = await open(disk);
    const order: string[] = [];
    const write = disk.write.bind(disk);
    const remove = disk.remove.bind(disk);
    disk.write = async (path, content) => {
      order.push(path);
      await write(path, content);
    };
    disk.remove = async (path) => {
      order.push(`rm ${path}`);
      await remove(path);
    };

    await fs.write('releases/r.md', '---\nstatus: future\n---\n');

    expect(order).toEqual(['backlog.md', 'releases/r.md', 'epics/parser.md', 'rm epics/no_epic.md']);
  });

  it('undoes what landed when a step fails part-way, leaving no task in two files', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'epics/no_epic.md': NO_EPIC });
    const { fs } = await open(disk);
    disk.failWrites = 'epics/no_epic.md';

    await expect(fs.write('docs/a.md', 'x\n')).rejects.toThrow(/disk full/);
    disk.failWrites = null;
    expect(disk.files.has('backlog.md')).toBe(false);
    expect(disk.files.has('docs/a.md')).toBe(false);
    expect(disk.text('epics/parser.md')).toBe(PARSER);
    expect(disk.text('epics/no_epic.md')).toBe(NO_EPIC);

    // Still pending, so the next write converts.
    await fs.write('docs/a.md', 'x\n');
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-4', 'BD-3', 'BD-2']);
  });

  it('holds a second write until the converting one has settled', async () => {
    const disk = await board({ 'epics/parser.md': PARSER });
    const { fs } = await open(disk);
    const first = fs.write('docs/a.md', 'a\n');
    const second = fs.write('docs/b.md', 'b\n');
    await Promise.all([first, second]);
    expect(disk.text('docs/b.md')).toBe('b\n');
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-4', 'BD-2']);
  });

  it('removes an empty no_epic.md without creating backlog.md', async () => {
    const disk = await board({ 'epics/no_epic.md': '---\n{}\n---\n' });
    const { fs } = await open(disk);
    await fs.write('docs/a.md', 'x\n');
    expect(disk.files.has('epics/no_epic.md')).toBe(false);
    expect(disk.files.has('backlog.md')).toBe(false);
  });

  it('carries a task id found twice twice', async () => {
    const disk = await board({
      'epics/parser.md': PARSER,
      'epics/ui.md': UI.replace('BD-5', 'BD-4'),
    });
    const { fs } = await open(disk);
    await fs.write('docs/a.md', 'x\n');
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-4', 'BD-4', 'BD-2']);
  });

  it('never carries a deletion or a folder creation', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'docs/old.md': 'x\n' });
    const { fs } = await open(disk);
    await fs.remove('docs/old.md');
    expect(disk.text('epics/parser.md')).toBe(PARSER);
    expect(disk.files.has('backlog.md')).toBe(false);
  });
});

describe('the layout conversion, around unreadable files', () => {
  const BROKEN_TASK = '\n## Broken\n\n---\nid: [\n---\n';

  it('leaves an unreadable epic file in place, its tasks shown and its writes refused', async () => {
    const disk = await board({ 'epics/parser.md': PARSER + BROKEN_TASK, 'epics/ui.md': UI });
    const { fs, result, onUnreadable } = await open(disk);
    expect(result.snapshot.heldBack.map((b) => b.filename)).toEqual(['epics/parser.md']);
    expect(result.snapshot.backlog!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-5']);

    await fs.write('docs/a.md', 'x\n');
    expect(disk.text('epics/parser.md')).toBe(PARSER + BROKEN_TASK);
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-5']);

    await expect(fs.write('epics/parser.md', 'anything')).rejects.toThrow(/could not read/);
    expect(onUnreadable).toHaveBeenCalled();
  });

  it('holds everything back when backlog.md is unreadable, refusing writes to each file', async () => {
    const disk = await board({ 'epics/ui.md': UI, 'backlog.md': BROKEN_TASK });
    const { fs, result } = await open(disk);
    expect(result.conversion).toBeNull();
    expect(result.snapshot.heldBack.map((b) => b.filename)).toEqual(['epics/ui.md']);
    expect(result.problems.some((p) => p.file === 'epics/ui.md' && p.level === 'error')).toBe(true);

    await expect(fs.write('epics/ui.md', '---\nname: UI\ncolor: "#000000"\n---\n')).rejects.toThrow(
      /could not read/,
    );
    expect(disk.text('epics/ui.md')).toBe(UI);
  });
});
