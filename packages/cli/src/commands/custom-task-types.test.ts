import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

describe('custom task types (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  const declare = async (yaml: string): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}${yaml}`, 'utf8');
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-types-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TT', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('answers USAGE naming the enabled types at every --type site', async () => {
    await declare('taskTypes:\n  - key: tech\n    disabled: true\ncustomTaskTypes:\n  - key: ops\n');
    await taskCommand(parseArgs(['task', 'add', 'A']), ctx);
    const argvs = [
      ['task', 'edit', 'TT-1', '--type', 'tech'],
      ['task', 'add', 'B', '--type', 'tech'],
      ['task', 'list', '--type', 'tech'],
    ];
    for (const argv of argvs) {
      await expect(taskCommand(parseArgs(argv), ctx)).rejects.toMatchObject({
        code: 'USAGE',
        message: 'Invalid --type "tech" (one of bug, feature, docs, ops).',
      });
    }
  });

  it('adds without --type using feature, and the first enabled type when feature is off', async () => {
    await taskCommand(parseArgs(['task', 'add', 'A']), ctx);
    const first = await taskCommand(parseArgs(['task', 'get', 'TT-1']), ctx);
    expect(
      (first.data as { tasks: { task: { frontmatter: { type: string } } }[] }).tasks[0]?.task
        .frontmatter.type,
    ).toBe('feature');
    await declare(
      'taskTypes:\n  - key: feature\n    disabled: true\ncustomTaskTypes:\n  - key: ops\n',
    );
    await taskCommand(parseArgs(['task', 'add', 'B']), ctx);
    const second = await taskCommand(parseArgs(['task', 'get', 'TT-2']), ctx);
    expect(
      (second.data as { tasks: { task: { frontmatter: { type: string } } }[] }).tasks[0]?.task
        .frontmatter.type,
    ).toBe('bug');
  });

  it('reports enabled types as objects and includes iconNames', async () => {
    await declare(
      'taskTypes:\n  - key: tech\n    disabled: true\ncustomTaskTypes:\n  - key: ops\n    icon: server\n    color: "#0EA5E9"\n    commitPrefix: ops\n',
    );
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    const data = out.data as {
      version: number;
      taskTypes: { key: string; icon: string; color: string; commitPrefix: string }[];
      iconNames: string[];
    };
    expect(data.version).toBe(16);
    expect(data.taskTypes.map((t) => t.key)).toEqual(['bug', 'feature', 'docs', 'ops']);
    expect(data.taskTypes.find((t) => t.key === 'ops')).toMatchObject({
      icon: 'server',
      color: '#0EA5E9',
      commitPrefix: 'ops',
    });
    expect(data.iconNames).toEqual(expect.arrayContaining(['server', 'trending-up', 'circle']));
  });

  it('an invalid declaration fails the board with BOARD_INVALID', async () => {
    await declare('taskTypes:\n  - key: nope\n    disabled: true\n');
    await expect(taskCommand(parseArgs(['task', 'add', 'T']), ctx)).rejects.toMatchObject({
      code: 'BOARD_INVALID',
    });
  });
});
