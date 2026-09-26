import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

const OLD_EPIC = `---
name: UI
color: "#1f6feb"
---

The UI epic.

## Buttons

---
id: TS-5
type: feature
status: todo
order: 200
---
`;

const OLD_NO_EPIC = `---
{}
---

## Loose

---
id: TS-3
type: bug
status: todo
order: 100
---
`;

interface Entry {
  id: string;
  in: { kind: string; file: string };
}

describe('the single backlog file (cli)', () => {
  let project: string;
  let board: string;
  let ctx: CommandContext;

  const read = (path: string): Promise<string> => readFile(join(board, path), 'utf8');
  const exists = async (path: string): Promise<boolean> =>
    stat(join(board, path)).then(
      () => true,
      () => false,
    );
  const list = async (...flags: string[]): Promise<Entry[]> =>
    ((await taskCommand(parseArgs(['task', 'list', ...flags]), ctx)).data as { tasks: Entry[] })
      .tasks;
  const oldLayout = async (): Promise<void> => {
    await mkdir(join(board, 'epics'), { recursive: true });
    await writeFile(join(board, 'epics', 'ui.md'), OLD_EPIC, 'utf8');
    await writeFile(join(board, 'epics', 'no_epic.md'), OLD_NO_EPIC, 'utf8');
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-layout-'));
    board = join(project, '.boardown');
    ctx = { cwd: project, json: true, dataDir: board };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('reports an old-layout task as backlog, in the file it really sits in, and reads convert nothing', async () => {
    await oldLayout();

    expect(await list('--backlog')).toEqual([
      expect.objectContaining({ id: 'TS-3', in: { kind: 'backlog', file: 'epics/no_epic.md' } }),
      expect.objectContaining({ id: 'TS-5', in: { kind: 'backlog', file: 'epics/ui.md' } }),
    ]);
    const got = (await taskCommand(parseArgs(['task', 'get', 'TS-5']), ctx)).data as {
      tasks: { in: { kind: string; file: string } }[];
    };
    expect(got.tasks[0]!.in).toEqual({ kind: 'backlog', file: 'epics/ui.md' });
    expect(await read('epics/ui.md')).toBe(OLD_EPIC);
    expect(await exists('backlog.md')).toBe(false);
  });

  it('converts on the first write and then reports backlog.md', async () => {
    await oldLayout();

    await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx);

    expect(await exists('epics/no_epic.md')).toBe(false);
    expect(await read('epics/ui.md')).toBe('---\nname: UI\ncolor: "#1f6feb"\n---\n\nThe UI epic.\n');
    expect(await read('backlog.md')).toMatch(/^epic: ui$/m);
    expect(await list('--backlog')).toEqual([
      expect.objectContaining({ id: 'TS-3', in: { kind: 'backlog', file: 'backlog.md' } }),
      expect.objectContaining({ id: 'TS-5', in: { kind: 'backlog', file: 'backlog.md' } }),
    ]);
    const epic = (await epicCommand(parseArgs(['epic', 'get', 'ui']), ctx)).data as {
      epic: { taskCount: number };
    };
    expect(epic.epic.taskCount).toBe(1);
  });

  it('creates a release-less task in backlog.md with its epic, and edits the epic in place', async () => {
    await epicCommand(parseArgs(['epic', 'add', 'UI']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'First']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Second', '--epic', 'ui']), ctx);
    expect(await read('backlog.md')).toMatch(/^epic: ui$/m);
    expect(await read('epics/ui.md')).not.toContain('## Second');

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--epic', 'ui']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-2', '--no-epic']), ctx);

    const text = await read('backlog.md');
    expect(text.indexOf('## First')).toBeLessThan(text.indexOf('## Second'));
    expect(text.match(/^epic: ui$/gm)).toHaveLength(1);
    expect(text.slice(text.indexOf('## First'), text.indexOf('## Second'))).toContain('epic: ui');
  });

  it('keeps a task\'s epic when it leaves a release, by --no-release and by release done', async () => {
    await epicCommand(parseArgs(['epic', 'add', 'UI']), ctx);
    const rel = (await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data as {
      slug: string;
    };
    await releaseCommand(parseArgs(['release', 'start', rel.slug]), ctx);
    await taskCommand(parseArgs(['task', 'add', 'A', '--epic', 'ui', '--release', rel.slug]), ctx);
    await taskCommand(parseArgs(['task', 'add', 'B', '--epic', 'ui', '--release', rel.slug]), ctx);

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--no-release']), ctx);
    await releaseCommand(parseArgs(['release', 'done', rel.slug]), ctx);

    const entries = await list('--backlog', '--epic', 'ui');
    expect(entries.map((e) => e.id)).toEqual(['TS-1', 'TS-2']);
    expect(await read('epics/ui.md')).not.toContain('##');
  });

  it('refuses an epic whose slug is no_epic with EPIC_INVALID', async () => {
    await expect(epicCommand(parseArgs(['epic', 'add', 'no_epic']), ctx)).rejects.toMatchObject({
      code: 'EPIC_INVALID',
    });
    expect(await exists('epics/no_epic.md')).toBe(false);
  });
});
