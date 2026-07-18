import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { archiveCommand } from './archive';
import { backlogCommand } from './backlog';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

interface Section {
  key: string;
  status: string | null;
  taskCount: number;
  tasks: { id: string }[];
}

const sections = async (ctx: CommandContext, ...flags: string[]): Promise<Section[]> => {
  const out = await backlogCommand(parseArgs(['backlog', ...flags]), ctx);
  return (out.data as { sections: Section[] }).sections;
};

const slugOf = (data: unknown): string => (data as { slug: string }).slug;

describe('view commands (backlog / archive)', () => {
  let project: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-views-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('an empty board yields a single empty backlog section', async () => {
    const out = await sections(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe('backlog');
    expect(out[0]?.taskCount).toBe(0);
    expect(out[0]?.tasks).toEqual([]);
  });

  it('merges epic-owned and no-epic tasks into one globally ordered backlog section', async () => {
    await epicCommand(parseArgs(['epic', 'add', 'Core', '--color', '#1f6feb']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'plain one']), ctx); // TS-1, no_epic
    await taskCommand(parseArgs(['task', 'add', 'epic one', '--epic', 'core']), ctx); // TS-2
    await taskCommand(parseArgs(['task', 'add', 'plain two']), ctx); // TS-3

    const backlog = (await sections(ctx)).find((s) => s.key === 'backlog');
    expect(backlog?.taskCount).toBe(3);
    // One flat list, not "epic file first then no_epic". The ordering rule
    // itself is covered directly in core's ordering tests.
    expect(backlog?.tasks.map((t) => t.id).sort()).toEqual(['TS-1', 'TS-2', 'TS-3']);
  });

  it('lists the current release, then future releases, then the backlog', async () => {
    const current = slugOf((await releaseCommand(parseArgs(['release', 'add', 'aaa']), ctx)).data);
    await releaseCommand(parseArgs(['release', 'start', current]), ctx);
    const future = slugOf((await releaseCommand(parseArgs(['release', 'add', 'bbb']), ctx)).data);
    await taskCommand(parseArgs(['task', 'add', 'shipped', '--release', current]), ctx);

    const out = await sections(ctx);
    expect(out.map((s) => s.key)).toEqual([current, future, 'backlog']);
    expect(out.map((s) => s.status)).toEqual(['current', 'future', null]);
  });

  it('backlog returns summaries by default and whole tasks under --full', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Only', '--description', 'body text']), ctx);

    const [plain] = await sections(ctx);
    expect(plain?.tasks[0]).not.toHaveProperty('description');
    expect(plain?.tasks[0]).not.toHaveProperty('frontmatter');

    const [full] = await sections(ctx, '--full');
    const task = full?.tasks[0] as unknown as Task;
    expect(task.description).toBe('body text');
    expect(task.frontmatter.id).toBe('TS-1');
  });

  it('a finished release leaves the backlog view and shows up in archive, newest first', async () => {
    for (const name of ['r1', 'r2']) {
      const slug = slugOf((await releaseCommand(parseArgs(['release', 'add', name]), ctx)).data);
      await releaseCommand(parseArgs(['release', 'start', slug]), ctx);
      await releaseCommand(parseArgs(['release', 'done', slug]), ctx);
    }

    expect((await sections(ctx)).map((s) => s.key)).toEqual(['backlog']);

    const out = await archiveCommand(parseArgs(['archive']), ctx);
    const releases = (out.data as { releases: { slug: string; taskCount: number }[] }).releases;
    expect(releases.map((r) => r.slug)).toEqual(['r2', 'r1']);
    expect(releases[0]).not.toHaveProperty('tasks');
  });

  it('archive lists tasks only under --full', async () => {
    const slug = slugOf((await releaseCommand(parseArgs(['release', 'add', 'r1']), ctx)).data);
    await releaseCommand(parseArgs(['release', 'start', slug]), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Done thing', '--release', slug]), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
    await releaseCommand(parseArgs(['release', 'done', slug]), ctx);

    const out = await archiveCommand(parseArgs(['archive', '--full']), ctx);
    const releases = (out.data as { releases: { tasks: { id: string }[] }[] }).releases;
    expect(releases[0]?.tasks.map((t) => t.id)).toEqual(['TS-1']);
  });

  it('an empty archive reports no finished releases', async () => {
    const out = await archiveCommand(parseArgs(['archive']), ctx);
    expect((out.data as { releases: unknown[] }).releases).toEqual([]);
    expect(out.human).toContain('No finished releases.');
  });

  it('release current returns a flat, ordered task list with status on each summary', async () => {
    const slug = slugOf((await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data);
    await releaseCommand(parseArgs(['release', 'start', slug]), ctx);
    await taskCommand(parseArgs(['task', 'add', 'first', '--release', slug]), ctx);
    await taskCommand(parseArgs(['task', 'add', 'second', '--release', slug]), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);

    const out = await releaseCommand(parseArgs(['release', 'current']), ctx);
    const release = (out.data as {
      release: { slug: string; taskCount: number; tasks: { id: string; status: string }[] };
    }).release;
    expect(release.slug).toBe(slug);
    expect(release.taskCount).toBe(2);
    expect(release.tasks.map((t) => t.status)).toContain('done');
    expect(release.tasks[0]).not.toHaveProperty('frontmatter');
  });

  it('release current is null when nothing is current', async () => {
    const out = await releaseCommand(parseArgs(['release', 'current']), ctx);
    expect((out.data as { release: null }).release).toBeNull();
  });

  // This feature is presentation-only: it changed what commands *return*, never
  // what they write. Guard that claim rather than trusting the diff.
  it('trimming the output did not change what a mutation writes to disk', async () => {
    const file = join(project, '.boardown', 'epics', 'no_epic.md');
    await taskCommand(parseArgs(['task', 'add', 'Write me', '--description', 'body']), ctx);
    await taskCommand(parseArgs(['task', 'checklist', 'add', 'TS-1', 'step one']), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'in-progress']), ctx);

    expect(await readFile(file, 'utf8')).toBe(
      [
        '---',
        '{}',
        '---',
        '',
        '## Write me',
        '',
        '---',
        'id: TS-1',
        'type: feature',
        'status: in-progress',
        'order: 100',
        'checklist:',
        '  - id: c1',
        '    text: step one',
        '    done: false',
        '---',
        '',
        'body',
        '',
      ].join('\n'),
    );
  });

  it('release get and epic get expand tasks in full under --full', async () => {
    const slug = slugOf((await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data);
    await epicCommand(parseArgs(['epic', 'add', 'Core', '--color', '#1f6feb']), ctx);
    await taskCommand(
      parseArgs(['task', 'add', 'in release', '--release', slug, '--description', 'rel body']),
      ctx,
    );
    await taskCommand(
      parseArgs(['task', 'add', 'in epic', '--epic', 'core', '--description', 'epic body']),
      ctx,
    );

    const relSummary = (await releaseCommand(parseArgs(['release', 'get', slug]), ctx)).data as {
      release: { tasks: object[] };
    };
    expect(relSummary.release.tasks[0]).not.toHaveProperty('frontmatter');

    const relFull = (await releaseCommand(parseArgs(['release', 'get', slug, '--full']), ctx))
      .data as { release: { tasks: Task[] } };
    expect(relFull.release.tasks[0]?.description).toBe('rel body');

    const epicSummary = (await epicCommand(parseArgs(['epic', 'get', 'core']), ctx)).data as {
      epic: { tasks: object[] };
    };
    expect(epicSummary.epic.tasks[0]).not.toHaveProperty('frontmatter');

    const epicFull = (await epicCommand(parseArgs(['epic', 'get', 'core', '--full']), ctx)).data as {
      epic: { tasks: Task[] };
    };
    expect(epicFull.epic.tasks[0]?.description).toBe('epic body');
  });

  it('release list and epic list add task summaries only under --full', async () => {
    await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx);
    await epicCommand(parseArgs(['epic', 'add', 'Core', '--color', '#1f6feb']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'x', '--epic', 'core']), ctx);

    const releases = (await releaseCommand(parseArgs(['release', 'list']), ctx)).data as {
      releases: object[];
    };
    expect(releases.releases[0]).not.toHaveProperty('tasks');

    const epics = (await epicCommand(parseArgs(['epic', 'list', '--full']), ctx)).data as {
      epics: { tasks: { id: string }[] }[];
    };
    expect(epics.epics[0]?.tasks.map((t) => t.id)).toEqual(['TS-1']);
  });
});
