import { describe, expect, it, vi } from 'vitest';
import { createGuardedFs } from './conflicts.js';
import { readDocPage } from './docs.js';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';
import { createConvertingFs } from './layout.js';
import { loadBoard, type LoadBoardResult } from './loader.js';
import { parseBacklog } from './parser.js';
import { commitWithTaskIdRepairs } from './repair-task-ids.js';
import { markdownTaskRefs, proseTaskRefs } from './refs.js';

class InMemoryFs implements FsAdapter {
  async readBytes(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.read(path));
  }
  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    await this.write(path, new TextDecoder().decode(content));
  }
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
    return entry === undefined ? null : { lastModified: entry.lastModified, size: new TextEncoder().encode(entry.content).byteLength };
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
  const onLanded = vi.fn();
  const converting = createConvertingFs(
    guarded,
    result.conversion,
    () => result.snapshot.backlog,
    onLanded,
  );
  return { result, fs: converting, onConflict, onUnreadable, onLanded };
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

const taskBlock = (id: string, title: string, day?: number, extra = '', body = ''): string =>
  `## ${title}\n\n---\nid: ${id}\ntype: tech\nstatus: todo\norder: 100\n${day === undefined ? '' : `createdAt: "2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z"\n`}${extra}---\n\n${body}\n\n`;

describe('duplicate task repairs', () => {
  it('detects same-file and legacy occurrences without persisting a stale counter', async () => {
    const disk = await board({
      'backlog.md': taskBlock('BD-90', 'One', 1) + taskBlock('BD-90', 'Two', 2),
      'epics/no_epic.md': taskBlock('BD-90', 'Three', 3),
    });
    const { result } = await open(disk);
    expect(result.snapshot.config.nextId).toBe(91);
    expect(disk.text('config.yaml')).toBe(CONFIG);
    expect(result.problems.find((p) => p.duplicateTaskIds)?.duplicateTaskIds).toEqual({
      id: 'BD-90',
      copies: [
        { file: 'backlog.md', taskIndex: 0, title: 'One' },
        { file: 'backlog.md', taskIndex: 1, title: 'Two' },
        { file: 'epics/no_epic.md', taskIndex: 0, title: 'Three' },
      ],
    });
  });

  it('renumbers only younger copies and rewrites a proven archived inverse, not task content or another relation', async () => {
    const unchanged = taskBlock('BD-3', 'Unchanged', 2, 'unknown: "retain formatting" # untouched\n');
    const disk = await board({
      'backlog.md':
        taskBlock('BD-1', 'Younger', 2, 'links:\n  - type: blocks\n    to: BD-2\n') +
        taskBlock('BD-1', 'Oldest', 1, 'links:\n  - type: relates\n    to: BD-2\n'),
      'releases/finished.md': '---\nstatus: finished\n---\n\n' +
        taskBlock('BD-2', 'Peer', 3, 'links:\n  - type: blocked-by\n    to: BD-1\n  - type: relates\n    to: BD-1\n') + unchanged,
    });
    const { fs, result } = await open(disk);
    const repairs = await commitWithTaskIdRepairs(fs, result.snapshot, { writes: [], removes: [] }, 'BD-1');
    expect(repairs).toEqual([{ oldId: 'BD-1', newId: 'BD-20', title: 'Younger', file: 'backlog.md' }]);
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-20', 'BD-1']);
    expect(disk.text('releases/finished.md')).toContain('type: blocked-by\n    to: BD-20\n  - type: relates\n    to: BD-1');
    expect(disk.text('releases/finished.md')).toContain(unchanged);
    expect(disk.text('config.yaml')).toContain('nextId: 21\n');
  });

  it('does not renumber a task in a frozen finished release', async () => {
    const old = taskBlock('BD-1', 'Old', 1);
    const finished = '---\nstatus: finished\n---\n\n' + taskBlock('BD-1', 'Young and frozen', 2);
    const disk = await board({ 'backlog.md': old, 'releases/finished.md': finished });
    const { result, fs } = await open(disk);
    await expect(commitWithTaskIdRepairs(fs, result.snapshot, { writes: [], removes: [] }, 'BD-1'))
      .rejects.toHaveProperty('problems.1.file', 'releases/finished.md');
    expect(disk.text('releases/finished.md')).toBe(finished);
    expect(disk.text('config.yaml')).toBe(CONFIG);
  });

  it('repairs a legacy record in place and retains the latest header and the untouched copy', async () => {
    const old = taskBlock('BD-1', 'Old copy', 1, 'unknown: "keep this line" # exact\n');
    const young = taskBlock('BD-1', 'Young copy', 2);
    const header = '---\nname: Old name\ncolor: "#123456"\n---\n\nEpic description.';
    const path = 'epics/old.md';
    const disk = await board({ [path]: `${header}\n\n${old}${young}` });
    const { result, fs } = await open(disk);
    const current = header.replace('Old name', 'Current name');
    await fs.write(path, `${current}\n\n${old}${young}`);
    const repaired = await commitWithTaskIdRepairs(fs, result.snapshot, { writes: [], removes: [] }, 'BD-1');
    expect(repaired).toEqual([{ oldId: 'BD-1', newId: 'BD-20', title: 'Young copy', file: path }]);
    expect(disk.text(path)?.startsWith(`${current}\n\n${old}`)).toBe(true);
    expect(disk.text(path)).toContain('## Young copy\n\n---\nid: BD-20\n');
    expect(disk.text('backlog.md')).toBeUndefined();
  });

  it('writes unrelated edits and independent repairs without changing blocked task text in the same file', async () => {
    const blockedA = taskBlock('BD-1', 'Blocked one', undefined, 'unknown: "preserve me" # own formatting\n');
    const blockedB = taskBlock('BD-1', 'Blocked two', 2);
    const safe = taskBlock('BD-2', 'Safe oldest', 1) + taskBlock('BD-2', 'Safe younger', 2);
    const ordinary = taskBlock('BD-3', 'Ordinary edit', 3);
    const disk = await board({ 'backlog.md': blockedA + blockedB + safe + ordinary });
    const { fs, result } = await open(disk);
    const writes = [{ path: 'backlog.md', content: blockedA + blockedB + safe + ordinary.replace('Ordinary edit', 'Updated') }];
    expect(await commitWithTaskIdRepairs(fs, result.snapshot, { writes, removes: [] })).toEqual([
      { oldId: 'BD-2', newId: 'BD-20', title: 'Safe younger', file: 'backlog.md' },
    ]);
    expect(disk.text('backlog.md')?.startsWith(blockedA + blockedB)).toBe(true);
    expect(disk.text('backlog.md')).toContain('Updated');
  });

  it('reports the Docs path and attachment without writing, and excludes code and existing link labels', async () => {
    const text = taskBlock('BD-1', 'Old', 1) + taskBlock('BD-1', 'Young', 2);
    const disk = await board({
      'backlog.md': text,
      'docs/nested/refs.md': '`BD-1` [BD-1](https://example.com/) **BD-1**',
      'attachments/BD-1/shot.png': 'bytes',
    });
    const { fs, result } = await open(disk);
    const blocked: unknown = await commitWithTaskIdRepairs(fs, result.snapshot, { writes: [], removes: [] }, 'BD-1')
      .catch((error: unknown) => error);
    expect(blocked).toHaveProperty('problems.1.file', 'docs/nested/refs.md');
    expect(blocked).toHaveProperty('problems.2.file', 'attachments/BD-1/shot.png');
    expect(markdownTaskRefs('`BD-1`\n\n```\nBD-1\n```\n\n[BD-1](https://example.com) **BD-2**')).toEqual(['BD-2']);
    expect(proseTaskRefs('[[BD-1]] https://example.com/BD-2 BD-3')).toEqual(['BD-3']);
    expect(disk.text('backlog.md')).toBe(text);
    expect(disk.text('config.yaml')).toBe(CONFIG);
  });

  it('drops a group whose attachments changed at commit but keeps another group and the ordinary write', async () => {
    const original = taskBlock('BD-1', 'A', 1) + taskBlock('BD-1', 'B', 2) +
      taskBlock('BD-2', 'C', 1) + taskBlock('BD-2', 'D', 2) + taskBlock('BD-3', 'Before', 3);
    const disk = await board({ 'backlog.md': original });
    const { fs, result } = await open(disk);
    const list = disk.list.bind(disk);
    let inspections = 0;
    vi.spyOn(disk, 'list').mockImplementation(async (path) => {
      if (path === 'attachments/BD-1' && ++inspections === 2)
        await disk.write(`${path}/external.txt`, 'from another window');
      return list(path);
    });
    const repairs = await commitWithTaskIdRepairs(fs, result.snapshot, {
      writes: [{ path: 'backlog.md', content: original.replace('Before', 'After') }],
      removes: [],
    });
    expect(repairs).toEqual([{ oldId: 'BD-2', newId: 'BD-20', title: 'D', file: 'backlog.md' }]);
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-1', 'BD-1', 'BD-2', 'BD-20', 'BD-3']);
    expect(disk.text('backlog.md')).toContain('## After');
  });

  it('rolls back the ordinary write and repair together when the counter cannot be written', async () => {
    const backlog = taskBlock('BD-1', 'Old', 1) + taskBlock('BD-1', 'Young', 2) + taskBlock('BD-3', 'Before', 3);
    const disk = await board({ 'backlog.md': backlog });
    const { fs, result } = await open(disk);
    disk.failWrites = 'config.yaml';
    await expect(commitWithTaskIdRepairs(fs, result.snapshot, {
      writes: [{ path: 'backlog.md', content: backlog.replace('Before', 'After') }], removes: [],
    })).rejects.toThrow('disk full');
    expect(disk.text('backlog.md')).toBe(backlog);
    expect(disk.text('config.yaml')).toBe(CONFIG);
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

  it('leaves duplicate legacy blocks in place and still moves other records', async () => {
    const disk = await board({
      'epics/parser.md': PARSER,
      'epics/ui.md': UI.replace('BD-5', 'BD-4'),
    });
    const { fs } = await open(disk);
    await fs.write('docs/a.md', 'x\n');
    expect(ids(disk.text('backlog.md'))).toEqual(['BD-2']);
    expect(disk.text('epics/parser.md')).toContain(PARSER.slice(PARSER.indexOf('## Grammar')).trimEnd());
    expect(disk.text('epics/ui.md')).toBe(UI.replace('BD-5', 'BD-4'));
  });

  it('never carries a deletion or a folder creation', async () => {
    const disk = await board({ 'epics/parser.md': PARSER, 'docs/old.md': 'x\n' });
    const { fs } = await open(disk);
    const loaded = await readDocPage(fs, 'docs/old.md');
    if (loaded.kind !== 'ready') throw new Error('expected page');
    fs.observe('docs/old.md', loaded.version, []);
    await fs.remove('docs/old.md');
    expect(disk.text('epics/parser.md')).toBe(PARSER);
    expect(disk.files.has('backlog.md')).toBe(false);
  });
});

describe('the layout conversion, reported once it lands', () => {
  it('reports the landed conversion once, as complete, and nothing on later writes', async () => {
    const { fs, result, onLanded } = await open(
      await board({ 'epics/parser.md': PARSER, 'epics/no_epic.md': NO_EPIC }),
    );
    expect(result.conversion!.complete).toBe(true);
    await fs.write('docs/a.md', 'x\n');
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(onLanded).toHaveBeenCalledWith(result.conversion);
    await fs.write('docs/b.md', 'y\n');
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('reports nothing for a refused write, and reports the retry that lands', async () => {
    const disk = await board({ 'epics/parser.md': PARSER });
    const { fs, onLanded } = await open(disk);
    disk.failWrites = 'epics/parser.md';
    await expect(fs.write('docs/a.md', 'x\n')).rejects.toThrow(/disk full/);
    expect(onLanded).not.toHaveBeenCalled();
    disk.failWrites = null;
    await fs.write('docs/a.md', 'x\n');
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('reports nothing on a board already in the current layout', async () => {
    const { fs, onLanded } = await open(await board({ 'backlog.md': '' }));
    await fs.write('docs/a.md', 'x\n');
    expect(onLanded).not.toHaveBeenCalled();
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

  it('is incomplete while a file is held back', async () => {
    const { result } = await open(
      await board({ 'epics/parser.md': PARSER + BROKEN_TASK, 'epics/ui.md': UI }),
    );
    expect(result.conversion!.complete).toBe(false);
  });

  it('is incomplete while an epic file keeps only task sections it could not read', async () => {
    const disk = await board({
      'epics/parser.md': `${PARSER_HEAD}\n${BROKEN_TASK}`,
      'epics/ui.md': UI,
    });
    const { fs, result } = await open(disk);
    expect(result.snapshot.heldBack).toEqual([]);
    expect(result.conversion!.complete).toBe(false);
    await fs.write('docs/a.md', 'x\n');
    expect(disk.text('epics/parser.md')).toBe(`${PARSER_HEAD}\n${BROKEN_TASK}`);
  });

  it('is incomplete while no_epic.md keeps only a task section it could not read', async () => {
    const disk = await board({ 'epics/ui.md': UI, 'epics/no_epic.md': `---\n{}\n---\n${BROKEN_TASK}` });
    const { fs, result } = await open(disk);
    expect(result.conversion!.complete).toBe(false);
    await fs.write('docs/a.md', 'x\n');
    expect(disk.files.has('epics/no_epic.md')).toBe(true);
  });

  it('is incomplete while an epic file with unreadable metadata holds a task section', async () => {
    const disk = await board({
      'epics/ui.md': UI,
      'epics/stuck.md': UI.replace('name: UI', 'name: [').replace('BD-5', 'BD-6'),
    });
    const { result } = await open(disk);
    expect(result.snapshot.epics.map((e) => e.slug)).toEqual(['ui']);
    expect(result.snapshot.heldBack[0]?.tasks[0]?.frontmatter.id).toBe('BD-6');
    expect(result.conversion!.complete).toBe(false);
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
