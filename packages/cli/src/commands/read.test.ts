import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { backlogCommand } from './backlog';
import { epicCommand } from './epic';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

const backlogOrder = async (ctx: CommandContext): Promise<string[]> => {
  const data = (await backlogCommand(parseArgs(['backlog']), ctx)).data as {
    sections: { key: string; tasks: { id: string }[] }[];
  };
  const section = data.sections.find((s) => s.key === 'backlog');
  return (section?.tasks ?? []).map((t) => t.id);
};

describe('read + reorder commands', () => {
  let project: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-read-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('task get returns the task and its location', async () => {
    await taskCommand(parseArgs(['task', 'add', 'One']), ctx);
    const got = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
    const data = got.data as {
      tasks: { task: Task; in: { kind: string; file: string } }[];
      missing: string[];
    };
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]?.task.frontmatter.id).toBe('TS-1');
    expect(data.tasks[0]?.in.kind).toBe('backlog');
    expect(data.missing).toEqual([]);
  });

  it('task get takes several ids and lists missing ones', async () => {
    await taskCommand(parseArgs(['task', 'add', 'One']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'Two']), ctx);
    const mix = await taskCommand(parseArgs(['task', 'get', 'TS-2', 'TS-99', 'TS-1', 'TS-2']), ctx);
    const data = mix.data as { tasks: { task: Task }[]; missing: string[] };
    expect(data.tasks.map((entry) => entry.task.frontmatter.id)).toEqual(['TS-2', 'TS-1']);
    expect(data.missing).toEqual(['TS-99']);

    const none = await taskCommand(parseArgs(['task', 'get', 'TS-99', 'TS-99']), ctx);
    expect(none.data).toEqual({ tasks: [], missing: ['TS-99'] });

    await expect(taskCommand(parseArgs(['task', 'get']), ctx)).rejects.toMatchObject({
      code: 'USAGE',
      exitCode: 2,
    });
    await expect(
      taskCommand(parseArgs(['task', 'status', 'TS-99', 'done']), ctx),
    ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('schema reports task get as variadic with tasks/missing', async () => {
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    const data = out.data as {
      version: number;
      commands: { name: string; usage: string }[];
    };
    expect(data.version).toBe(14);
    expect(data.commands.find((command) => command.name === 'task get')?.usage).toBe(
      'boardown task get <id>…',
    );
  });

  it('epic list and epic get report epic membership', async () => {
    const created = (
      await epicCommand(parseArgs(['epic', 'add', 'Core', '--color', '#1f6feb']), ctx)
    ).data as { slug: string };
    await taskCommand(parseArgs(['task', 'add', 'x', '--epic', created.slug]), ctx);

    const list = (await epicCommand(parseArgs(['epic', 'list']), ctx)).data as {
      epics: { slug: string; taskCount: number }[];
    };
    expect(list.epics.find((e) => e.slug === created.slug)?.taskCount).toBe(1);

    const get = (await epicCommand(parseArgs(['epic', 'get', created.slug]), ctx)).data as {
      epic: { taskCount: number; tasks: { id: string }[] };
    };
    expect(get.epic.tasks).toHaveLength(1);
    expect(get.epic.taskCount).toBe(1);
  });

  it('release list, get, and current', async () => {
    const created = (await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx)).data as {
      slug: string;
    };

    const list = (await releaseCommand(parseArgs(['release', 'list']), ctx)).data as {
      releases: { slug: string; status: string }[];
    };
    expect(list.releases.some((r) => r.slug === created.slug)).toBe(true);

    const noCurrent = (await releaseCommand(parseArgs(['release', 'current']), ctx)).data as {
      release: { slug: string } | null;
    };
    expect(noCurrent.release).toBeNull();

    await releaseCommand(parseArgs(['release', 'start', created.slug]), ctx);
    const current = (await releaseCommand(parseArgs(['release', 'current']), ctx)).data as {
      release: { slug: string } | null;
    };
    expect(current.release?.slug).toBe(created.slug);

    const get = (await releaseCommand(parseArgs(['release', 'get', created.slug]), ctx))
      .data as { release: { slug: string } };
    expect(get.release.slug).toBe(created.slug);
  });

  it('task reorder moves a card up / down / before within its container', async () => {
    await taskCommand(parseArgs(['task', 'add', 'A']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'B']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'C']), ctx);
    expect(await backlogOrder(ctx)).toEqual(['TS-1', 'TS-2', 'TS-3']);

    await taskCommand(parseArgs(['task', 'reorder', 'TS-3', '--up']), ctx);
    expect(await backlogOrder(ctx)).toEqual(['TS-1', 'TS-3', 'TS-2']);

    await taskCommand(parseArgs(['task', 'reorder', 'TS-1', '--down']), ctx);
    expect(await backlogOrder(ctx)).toEqual(['TS-3', 'TS-1', 'TS-2']);

    await taskCommand(parseArgs(['task', 'reorder', 'TS-2', '--before', 'TS-3']), ctx);
    expect(await backlogOrder(ctx)).toEqual(['TS-2', 'TS-3', 'TS-1']);
  });

  it('task reorder requires exactly one direction flag', async () => {
    await taskCommand(parseArgs(['task', 'add', 'A']), ctx);
    await expect(taskCommand(parseArgs(['task', 'reorder', 'TS-1']), ctx)).rejects.toMatchObject({
      code: 'USAGE',
    });
  });

  it('task reorder rejects placing a task before itself', async () => {
    await taskCommand(parseArgs(['task', 'add', 'A']), ctx);
    await taskCommand(parseArgs(['task', 'add', 'B']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'reorder', 'TS-1', '--before', 'TS-1']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });
});
