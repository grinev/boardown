import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { backlogCommand } from './backlog';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

describe('labels (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  const run = (...argv: string[]) => taskCommand(parseArgs(['task', ...argv]), ctx);
  const labelsOf = async (id: string): Promise<string[] | undefined> => {
    const out = await run('get', id);
    return (out.data as { tasks: { task: Task }[] }).tasks[0]?.task.frontmatter.labels;
  };
  const config = () => readFile(configPath, 'utf8');

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-labels-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    await writeFile(configPath, `${await config()}labels:\n  - backend\n`, 'utf8');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('adds labels on task add, in the registry spelling, and grows the registry', async () => {
    await run('add', 'T', '--label', 'BACKEND', '--label', 'fresh', '--label', 'Fresh');
    expect(await labelsOf('TS-1')).toEqual(['backend', 'fresh']);
    expect(await config()).toMatch(/labels:\n {2}- backend\n {2}- fresh\n/);
  });

  it('adds and removes, answering with what changed', async () => {
    await run('add', 'T');
    const added = await run('label', 'add', 'TS-1', 'ui', 'Backend');
    expect(added.data).toEqual({ id: 'TS-1', added: ['ui', 'backend'], removed: [] });
    expect(await config()).toMatch(/- backend\n {2}- ui\n/);

    const removed = await run('label', 'rm', 'TS-1', 'UI');
    expect(removed.data).toEqual({ id: 'TS-1', added: [], removed: ['ui'] });
    expect(await labelsOf('TS-1')).toEqual(['backend']);
    // Removing from its last task leaves it registered.
    expect(await config()).toContain('- ui');
  });

  it('is a no-op for a carried label or a missing one', async () => {
    await run('add', 'T', '--label', 'backend');
    const before = await readFile(join(project, '.boardown', 'backlog.md'), 'utf8');
    expect((await run('label', 'add', 'TS-1', 'Backend')).data).toEqual({
      id: 'TS-1',
      added: [],
      removed: [],
    });
    expect((await run('label', 'remove', 'TS-1', 'nope')).data).toEqual({
      id: 'TS-1',
      added: [],
      removed: [],
    });
    expect(await readFile(join(project, '.boardown', 'backlog.md'), 'utf8')).toBe(before);
  });

  it.each([
    [['label', 'add', 'TS-1', 'two words']],
    [['label', 'add', 'TS-1', 'x'.repeat(29)]],
    [['label', 'rm', 'TS-1', 'two words']],
    [['label', 'add', 'TS-1']],
    [['add', 'T2', '--label', 'a b']],
    [['add', 'T2', '--label']],
  ])('refuses %j with USAGE and writes nothing', async (argv) => {
    await run('add', 'T');
    const before = await config();
    await expect(run(...argv)).rejects.toMatchObject({ code: 'USAGE' });
    expect(await config()).toBe(before);
  });

  it('refuses a task in a finished release with ARCHIVED, even as a no-op', async () => {
    await releaseCommand(parseArgs(['release', 'add', 'v1']), ctx);
    await releaseCommand(parseArgs(['release', 'start', 'v1']), ctx);
    await run('add', 'T', '--release', 'v1', '--label', 'backend');
    await run('status', 'TS-1', 'done');
    await releaseCommand(parseArgs(['release', 'done', 'v1']), ctx);
    await expect(run('label', 'add', 'TS-1', 'ui')).rejects.toMatchObject({ code: 'ARCHIVED' });
    await expect(run('label', 'add', 'TS-1', 'backend')).rejects.toMatchObject({
      code: 'ARCHIVED',
    });
  });

  it('carries labels in the summary only when the task has any', async () => {
    await run('add', 'A', '--label', 'backend');
    await run('add', 'B');
    const out = await backlogCommand(parseArgs(['backlog']), ctx);
    const json = JSON.stringify(out.data);
    expect(json).toContain('"labels":["backend"]');
    expect(json.match(/"labels"/g)).toHaveLength(1);
    const list = await run('list');
    expect(JSON.stringify(list.data)).toContain('"labels":["backend"]');
  });

  it('reports the limit and the registry in schema', async () => {
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    expect(out.data).toMatchObject({ labelMaxLength: 28, labels: ['backend'], version: 20 });
    await writeFile(configPath, (await config()).replace(/labels:\n {2}- backend\n/, ''), 'utf8');
    const bare = await schemaCommand(parseArgs(['schema']), ctx);
    expect(bare.data).not.toHaveProperty('labels');
  });
});
