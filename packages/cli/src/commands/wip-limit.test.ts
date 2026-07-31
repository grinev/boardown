import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { CliError } from '../output';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

describe('WIP limit (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  const setLimit = async (limit: number): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}wipLimits:\n  in-progress: ${limit}\n`, 'utf8');
  };

  const releaseFile = async (): Promise<string> =>
    readFile(join(project, '.boardown', 'releases', 'sprint.md'), 'utf8');

  const expectRefused = async (argv: string[]): Promise<void> => {
    const before = await releaseFile();
    await expect(taskCommand(parseArgs(argv), ctx)).rejects.toMatchObject({ code: 'WIP_LIMIT' });
    expect(await releaseFile()).toBe(before);
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-wip-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'sprint']), ctx);
    await releaseCommand(parseArgs(['release', 'start', 'sprint']), ctx);
    for (const title of ['A', 'B', 'C']) {
      await taskCommand(parseArgs(['task', 'add', title, '--release', 'sprint']), ctx);
    }
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'in-progress']), ctx);
    await taskCommand(parseArgs(['task', 'status', 'TS-2', 'in-progress']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('refuses task status into a full column and leaves the file untouched', async () => {
    await setLimit(2);
    await expectRefused(['task', 'status', 'TS-3', 'in-progress']);
  });

  it('refuses the whole edit, so a companion field is not written either', async () => {
    await setLimit(2);
    await expectRefused(['task', 'edit', 'TS-3', '--status', 'in-progress', '--title', 'X']);
  });

  it('refuses task add and leaves nextId untouched', async () => {
    await setLimit(2);
    const configBefore = await readFile(configPath, 'utf8');
    await expect(
      taskCommand(
        parseArgs(['task', 'add', 'N', '--release', 'sprint', '--status', 'in-progress']),
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'WIP_LIMIT' });
    expect(await readFile(configPath, 'utf8')).toBe(configBefore);
    expect(await releaseFile()).not.toContain('## N');
  });

  it('refuses pulling an in-progress task into a full current release', async () => {
    // TS-3 is started in the current release, then parked in a future one — the
    // status lock freezes it there as `in-progress`.
    await taskCommand(parseArgs(['task', 'status', 'TS-3', 'in-progress']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'later']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-3', '--release', 'later']), ctx);
    await setLimit(2);

    const laterPath = join(project, '.boardown', 'releases', 'later.md');
    const sprintBefore = await releaseFile();
    const laterBefore = await readFile(laterPath, 'utf8');
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-3', '--release', 'sprint']), ctx),
    ).rejects.toMatchObject({ code: 'WIP_LIMIT' });
    expect(await releaseFile()).toBe(sprintBefore);
    expect(await readFile(laterPath, 'utf8')).toBe(laterBefore);
  });

  it('allows pulling a todo task into a full current release', async () => {
    await releaseCommand(parseArgs(['release', 'add', 'later']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-3', '--release', 'later']), ctx);
    await setLimit(2);
    // It is the status that is capped, not the relocation.
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-3', '--release', 'sprint']), ctx),
    ).resolves.toBeDefined();
  });

  it('allows leaving the column, reordering and unrelated commands', async () => {
    await setLimit(2);
    await expect(
      taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx),
    ).resolves.toBeDefined();
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-3', '--title', 'Renamed']), ctx),
    ).resolves.toBeDefined();
  });

  it('succeeds when no limit is configured or there is room left', async () => {
    await expect(
      taskCommand(parseArgs(['task', 'status', 'TS-3', 'in-progress']), ctx),
    ).resolves.toBeDefined();
  });

  it('schema reports the limit only when the board has one', async () => {
    const without = await schemaCommand(parseArgs(['schema']), ctx);
    expect((without.data as { wipLimits?: unknown }).wipLimits).toBeUndefined();
    await setLimit(3);
    const withLimit = await schemaCommand(parseArgs(['schema']), ctx);
    expect((withLimit.data as { wipLimits?: unknown }).wipLimits).toEqual({ 'in-progress': 3 });
  });

  it('a refusal is a CliError with a non-zero exit code', async () => {
    await setLimit(2);
    try {
      await taskCommand(parseArgs(['task', 'status', 'TS-3', 'in-progress']), ctx);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).exitCode).not.toBe(0);
      expect((err as CliError).message).toContain('WIP limit');
    }
  });
});
