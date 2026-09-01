import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { GitHistoryResult } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CliError } from '../output';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { taskCommand } from './task';

const run = promisify(execFile);

// The board's own repository is never touched: every case builds a throwaway one
// in a temp folder and runs the command against that.
const gitInit = async (cwd: string): Promise<void> => {
  await run('git', ['init', '-q', '-b', 'main'], { cwd });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd });
  await run('git', ['config', 'user.name', 'Test'], { cwd });
  await run('git', ['config', 'commit.gpgsign', 'false'], { cwd });
};

const commit = async (cwd: string, subject: string, file: string): Promise<void> => {
  await writeFile(join(cwd, file), subject, 'utf8');
  await run('git', ['add', '-A'], { cwd });
  await run('git', ['commit', '-q', '-m', subject], { cwd });
};

describe('task commits', () => {
  let project: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-commits-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(
      parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']),
      ctx,
    );
    await taskCommand(parseArgs(['task', 'add', 'First task']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('reports no repository as a successful read, not an error', async () => {
    const out = await taskCommand(parseArgs(['task', 'commits', 'TS-1']), ctx);
    expect(out.data).toEqual({ state: 'not-a-repository', commits: [] });
    expect(out.human).toBe('Git is not initialized.');
  });

  it('reads an initialized repository with no commits as ready and empty', async () => {
    await gitInit(project);
    const out = await taskCommand(parseArgs(['task', 'commits', 'TS-1']), ctx);
    expect(out.data).toEqual({ state: 'ready', commits: [] });
    expect(out.human).toBe('No related commits.');
  });

  it('finds the commits whose subject holds the ID as a token, newest first', async () => {
    await gitInit(project);
    await commit(project, 'chore: unrelated work', 'a.txt');
    await commit(project, 'feat(TS-10): a longer id', 'b.txt');
    await commit(project, 'feat(TS-1): the first half', 'c.txt');
    await commit(project, 'fix ts-1 at last', 'd.txt');

    const out = await taskCommand(parseArgs(['task', 'commits', 'TS-1']), ctx);
    const result = out.data as GitHistoryResult;
    expect(result.state).toBe('ready');
    expect(result.commits.map((c) => c.subject)).toEqual([
      'fix ts-1 at last',
      'feat(TS-1): the first half',
    ]);
    expect(result.commits[0]?.hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(out.human.split('\n')).toHaveLength(2);
  });

  it('refuses an ID that names no task rather than answering empty', async () => {
    await expect(
      taskCommand(parseArgs(['task', 'commits', 'TS-99']), ctx),
    ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' } satisfies Partial<CliError>);
  });

  it('is a usage error without an ID', async () => {
    await expect(taskCommand(parseArgs(['task', 'commits']), ctx)).rejects.toMatchObject({
      code: 'USAGE',
    } satisfies Partial<CliError>);
  });
});
