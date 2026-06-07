import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Backlog, Epic, Release, Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { boardCommand } from './board';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

interface BoardData {
  releases: Release[];
  epics: Epic[];
  backlog: Backlog | null;
}

const board = async (ctx: CommandContext): Promise<BoardData> =>
  (await boardCommand(parseArgs(['board']), ctx)).data as BoardData;

const hasTask = (tasks: readonly Task[] | undefined, id: string): boolean =>
  (tasks ?? []).some((t) => t.frontmatter.id === id);

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
      release: Release;
    };
    expect(release.release.frontmatter.status).toBe('future');

    const started = (await releaseCommand(parseArgs(['release', 'start', release.release.slug]), ctx))
      .data as { release: Release };
    expect(started.release.frontmatter.status).toBe('current');

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', release.release.slug]), ctx);
    const afterMove = await board(ctx);
    expect(hasTask(afterMove.releases.find((r) => r.slug === release.release.slug)?.tasks, 'TS-1')).toBe(
      true,
    );
    expect(hasTask(afterMove.backlog?.tasks, 'TS-1')).toBe(false);

    await releaseCommand(parseArgs(['release', 'done', release.release.slug]), ctx);
    const afterDone = await board(ctx);
    expect(afterDone.releases.find((r) => r.slug === release.release.slug)?.frontmatter.status).toBe(
      'finished',
    );
    // The task was still open, so it returns to the backlog (it has no epic).
    expect(hasTask(afterDone.backlog?.tasks, 'TS-1')).toBe(true);
  });

  it('only one release can be current at a time', async () => {
    const a = (await releaseCommand(parseArgs(['release', 'add', 'a']), ctx)).data as {
      release: Release;
    };
    const b = (await releaseCommand(parseArgs(['release', 'add', 'b']), ctx)).data as {
      release: Release;
    };
    await releaseCommand(parseArgs(['release', 'start', a.release.slug]), ctx);
    await expect(
      releaseCommand(parseArgs(['release', 'start', b.release.slug]), ctx),
    ).rejects.toMatchObject({ code: 'RELEASE_CONFLICT' });
  });

  it('epic add, reassign a task to it via edit --epic, then edit the epic name', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Platform work']), ctx);
    const epic = (await epicCommand(parseArgs(['epic', 'add', 'Platform', '--color', '#ff0000']), ctx))
      .data as { epic: Epic };
    expect(epic.epic.frontmatter.color).toBe('#ff0000');

    // For a backlog task, --epic relocates it into the epic's file (where the tag
    // sticks); a task in a release would just be retagged in place.
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--epic', epic.epic.slug]), ctx);
    const got = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
    expect((got.data as { task: Task }).task.frontmatter.epic).toBe(epic.epic.slug);

    await epicCommand(parseArgs(['epic', 'edit', epic.epic.slug, '--name', 'Platform 2']), ctx);
    const afterEdit = await board(ctx);
    expect(afterEdit.epics.find((e) => e.slug === epic.epic.slug)?.frontmatter.name).toBe(
      'Platform 2',
    );
  });

  it('edit --release moves a task in, --no-release moves it back to the backlog', async () => {
    await taskCommand(parseArgs(['task', 'add', 'Roundtrip']), ctx);
    const release = (await releaseCommand(parseArgs(['release', 'add', 'rt']), ctx)).data as {
      release: Release;
    };
    await releaseCommand(parseArgs(['release', 'start', release.release.slug]), ctx);

    // combined field edit + move in one call
    await taskCommand(
      parseArgs(['task', 'edit', 'TS-1', '--status', 'in-progress', '--release', release.release.slug]),
      ctx,
    );
    let board2 = await board(ctx);
    const moved = board2.releases
      .find((r) => r.slug === release.release.slug)
      ?.tasks.find((t) => t.frontmatter.id === 'TS-1');
    expect(moved?.frontmatter.status).toBe('in-progress');

    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--no-release']), ctx);
    board2 = await board(ctx);
    expect(hasTask(board2.backlog?.tasks, 'TS-1')).toBe(true);
    expect(hasTask(board2.releases.find((r) => r.slug === release.release.slug)?.tasks, 'TS-1')).toBe(
      false,
    );
  });

  it('rejects an invalid epic color and editing a color', async () => {
    await expect(
      epicCommand(parseArgs(['epic', 'add', 'Bad', '--color', 'red']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });

    const epic = (await epicCommand(parseArgs(['epic', 'add', 'Ok', '--color', '#00ff00']), ctx))
      .data as { epic: Epic };
    await expect(
      epicCommand(parseArgs(['epic', 'edit', epic.epic.slug, '--color', '#000000']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });

  it('edit rejects --release together with --no-release', async () => {
    await taskCommand(parseArgs(['task', 'add', 'X']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', 'rt', '--no-release']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });
});
