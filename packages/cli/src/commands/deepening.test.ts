import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

// Where a task physically lives, read back through the CLI's own list command.
const locate = async (ctx: CommandContext, id: string): Promise<string | undefined> => {
  const out = await taskCommand(parseArgs(['task', 'list', '--full']), ctx);
  const entries = (out.data as { tasks: { task: Task; in: { kind: string; file: string } }[] })
    .tasks;
  return entries.find((e) => e.task.frontmatter.id === id)?.in.file;
};

const taskIn = async (ctx: CommandContext, id: string): Promise<Task> => {
  const out = await taskCommand(parseArgs(['task', 'get', id]), ctx);
  return (out.data as { task: Task }).task;
};

const releaseStatus = async (ctx: CommandContext, slug: string): Promise<string | undefined> => {
  const out = await releaseCommand(parseArgs(['release', 'list']), ctx);
  return (out.data as { releases: { slug: string; status: string }[] }).releases.find(
    (r) => r.slug === slug,
  )?.status;
};

const epicName = async (ctx: CommandContext, slug: string): Promise<string | undefined> => {
  const out = await epicCommand(parseArgs(['epic', 'list']), ctx);
  return (out.data as { epics: { slug: string; name: string }[] }).epics.find(
    (e) => e.slug === slug,
  )?.name;
};

describe('release / epic / move (deepening layer)', () => {
  let project: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-deep-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('release add → start → moves a task in → done sends it back to the backlog', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Ship it']), ctx);
    const release = (await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data as {
      slug: string;
    };
    expect(await releaseStatus(ctx, release.slug)).toBe('future');

    await releaseCommand(parseArgs(['release', 'start', release.slug]), ctx);
    expect(await releaseStatus(ctx, release.slug)).toBe('current');

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', release.slug]), ctx);
    expect(await locate(ctx, 'TS-1')).toContain(release.slug);

    await releaseCommand(parseArgs(['release', 'done', release.slug]), ctx);
    expect(await releaseStatus(ctx, release.slug)).toBe('finished');
    // The task was still open, so it returns to the backlog (it has no epic).
    expect(await locate(ctx, 'TS-1')).toBe('epics/no_epic.md');
  });

  it('only one release can be current at a time', async () => {
    const a = (await releaseCommand(parseArgs(['release', 'add', 'a']), ctx)).data as {
      slug: string;
    };
    const b = (await releaseCommand(parseArgs(['release', 'add', 'b']), ctx)).data as {
      slug: string;
    };
    await releaseCommand(parseArgs(['release', 'start', a.slug]), ctx);
    await expect(
      releaseCommand(parseArgs(['release', 'start', b.slug]), ctx),
    ).rejects.toMatchObject({ code: 'RELEASE_CONFLICT' });
  });

  it('epic add, reassign a task to it via edit --epic, then edit the epic name', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Platform work']), ctx);
    const epic = (await epicCommand(parseArgs(['epic', 'add', 'Platform', '--color', '#ff0000']), ctx))
      .data as { slug: string };

    // For a backlog task, --epic relocates it into the epic's file (where the tag
    // sticks); a task in a release would just be retagged in place.
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--epic', epic.slug]), ctx);
    expect((await taskIn(ctx, 'TS-1')).frontmatter.epic).toBe(epic.slug);

    await epicCommand(parseArgs(['epic', 'edit', epic.slug, '--name', 'Platform 2']), ctx);
    expect(await epicName(ctx, epic.slug)).toBe('Platform 2');
  });

  it('edit --release moves a task in, --no-release moves it back to the backlog', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Roundtrip']), ctx);
    const release = (await releaseCommand(parseArgs(['release', 'add', 'rt']), ctx)).data as {
      slug: string;
    };
    await releaseCommand(parseArgs(['release', 'start', release.slug]), ctx);

    // combined field edit + move in one call
    await taskCommand(
      parseArgs(['task', 'edit', 'TS-1', '--status', 'in-progress', '--release', release.slug]),
      ctx,
    );
    expect(await locate(ctx, 'TS-1')).toContain(release.slug);
    expect((await taskIn(ctx, 'TS-1')).frontmatter.status).toBe('in-progress');

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--no-release']), ctx);
    expect(await locate(ctx, 'TS-1')).toBe('epics/no_epic.md');
  });

  it('release edit updates name and description without moving the file', async () => {
    const release = (await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data as {
      slug: string;
    };

    await releaseCommand(
      parseArgs(['release', 'edit', release.slug, '--name', 'First beta', '--description', 'Ship']),
      ctx,
    );
    const view = (await releaseCommand(parseArgs(['release', 'get', release.slug]), ctx))
      .data as { release: { slug: string; name: string; description?: string; filename: string } };
    expect(view.release.name).toBe('First beta');
    expect(view.release.description).toBe('Ship');
    expect(view.release.slug).toBe(release.slug);
    expect(view.release.filename).toBe(`releases/${release.slug}.md`);

    await releaseCommand(parseArgs(['release', 'edit', release.slug, '--description', '']), ctx);
    const cleared = (await releaseCommand(parseArgs(['release', 'get', release.slug]), ctx))
      .data as { release: { description?: string } };
    expect(cleared.release.description).toBeUndefined();
  });

  it('release edit rejects no flags, an unknown release and a finished one', async () => {
    const release = (await releaseCommand(parseArgs(['release', 'add', 'v2']), ctx)).data as {
      slug: string;
    };
    await expect(
      releaseCommand(parseArgs(['release', 'edit', release.slug]), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
    await expect(
      releaseCommand(parseArgs(['release', 'edit', 'nope', '--name', 'X']), ctx),
    ).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' });

    await releaseCommand(parseArgs(['release', 'start', release.slug]), ctx);
    await releaseCommand(parseArgs(['release', 'done', release.slug]), ctx);
    await expect(
      releaseCommand(parseArgs(['release', 'edit', release.slug, '--name', 'X']), ctx),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
  });

  it('rejects an invalid epic color and editing a color', async () => {
    await expect(
      epicCommand(parseArgs(['epic', 'add', 'Bad', '--color', 'red']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });

    const epic = (await epicCommand(parseArgs(['epic', 'add', 'Ok', '--color', '#00ff00']), ctx))
      .data as { slug: string };
    await expect(
      epicCommand(parseArgs(['epic', 'edit', epic.slug, '--color', '#000000']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });

  it('edit rejects --release together with --no-release', async () => {
    await taskCommand(parseArgs(['task', 'add', 'X']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', 'rt', '--no-release']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });

  it('a finished release is read-only: task mutations fail with code ARCHIVED', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Shipped']), ctx);
    const release = (await releaseCommand(parseArgs(['release', 'add', 'r']), ctx)).data as {
      slug: string;
    };
    await releaseCommand(parseArgs(['release', 'start', release.slug]), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', release.slug]), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
    await releaseCommand(parseArgs(['release', 'done', release.slug]), ctx);

    // TS-1 was done, so it stayed in the now-finished release.
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--title', 'X']), ctx),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    await expect(taskCommand(parseArgs(['task', 'rm', 'TS-1']), ctx)).rejects.toMatchObject({
      code: 'ARCHIVED',
    });
    await expect(
      taskCommand(parseArgs(['task', 'add', 'Late', '--release', release.slug]), ctx),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
  });
});
