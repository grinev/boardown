import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

describe('custom statuses (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  const declare = async (yaml: string): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}${yaml}`, 'utf8');
  };

  const FOUR = 'statuses:\n  - key: backlog\n  - key: dev\n  - key: review\n  - key: shipped\n';

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-statuses-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'sprint']), ctx);
    await releaseCommand(parseArgs(['release', 'start', 'sprint']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('gives a new task the declared initial status', async () => {
    await declare(FOUR);
    await taskCommand(parseArgs(['task', 'add', 'A', '--release', 'sprint']), ctx);
    const out = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
    expect((out.data as { task: { frontmatter: { status: string } } }).task.frontmatter.status).toBe(
      'backlog',
    );
  });

  it('answers USAGE naming the board vocabulary at every --status site', async () => {
    await declare(FOUR);
    await taskCommand(parseArgs(['task', 'add', 'A', '--release', 'sprint']), ctx);
    const argvs = [
      ['task', 'status', 'TS-1', 'in-progress'],
      ['task', 'edit', 'TS-1', '--status', 'in-progress'],
      ['task', 'add', 'B', '--release', 'sprint', '--status', 'in-progress'],
      ['task', 'list', '--status', 'in-progress'],
    ];
    for (const argv of argvs) {
      await expect(taskCommand(parseArgs(argv), ctx)).rejects.toMatchObject({
        code: 'USAGE',
        message: 'Invalid status "in-progress" (one of backlog, dev, review, shipped).',
      });
    }
  });

  it('draws the glyph by position in a listing', async () => {
    await declare(FOUR);
    for (const title of ['A', 'B', 'C']) {
      await taskCommand(parseArgs(['task', 'add', title, '--release', 'sprint']), ctx);
    }
    await taskCommand(parseArgs(['task', 'status', 'TS-2', 'dev']), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-3', 'shipped']), ctx);
    const out = await releaseCommand(parseArgs(['release', 'current']), ctx);
    expect(out.human).toContain('○ TS-1');
    expect(out.human).toContain('◐ TS-2');
    expect(out.human).toContain('● TS-3');
  });

  it('caps two middle columns independently under the one wipLimits number', async () => {
    await declare(`${FOUR}wipLimits:\n  in-progress: 1\n`);
    for (const title of ['A', 'B', 'C']) {
      await taskCommand(parseArgs(['task', 'add', title, '--release', 'sprint']), ctx);
    }
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'dev']), ctx);
    // `dev` is full, `review` is not, and neither end is capped at all.
    await expect(
      taskCommand(parseArgs(['task', 'status', 'TS-2', 'dev']), ctx),
    ).rejects.toMatchObject({ code: 'WIP_LIMIT' });
    await taskCommand(parseArgs(['task', 'status', 'TS-2', 'review']), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-3', 'shipped']), ctx);
  });

  it('reports the board statuses, the echoed limit and the columns it caps', async () => {
    await declare(
      'statuses:\n  - key: backlog\n    label: Not started\n  - key: dev\n  - key: shipped\nwipLimits:\n  in-progress: 2\n',
    );
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    expect(out.data).toMatchObject({
      version: 11,
      taskStatuses: [{ key: 'backlog', label: 'Not started' }, { key: 'dev' }, { key: 'shipped' }],
      wipLimits: { 'in-progress': 2 },
      wipLimitedStatuses: ['dev'],
    });
  });

  it('reports the default three when the board declares none', async () => {
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    expect(out.data).toMatchObject({
      taskStatuses: [{ key: 'todo' }, { key: 'in-progress' }, { key: 'done' }],
    });
  });

  // The board's own file is never repaired: a task written under an older list
  // keeps its status and stays readable.
  it('loads a task whose status the board no longer declares', async () => {
    await taskCommand(parseArgs(['task', 'add', 'A', '--release', 'sprint']), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'in-progress']), ctx);
    await declare(FOUR);
    const out = await taskCommand(parseArgs(['task', 'get', 'TS-1']), ctx);
    expect((out.data as { task: { frontmatter: { status: string } } }).task.frontmatter.status).toBe(
      'in-progress',
    );
    // And it moves forward into a declared one.
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'dev']), ctx);
  });
});
