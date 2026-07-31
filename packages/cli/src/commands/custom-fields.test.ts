import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { CliError } from '../output';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

const DECLARATIONS = `customFields:
  - key: reporter
    label: Reporter
    type: string
  - key: env
    type: string
`;

describe('custom fields (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  const declare = async (yaml = DECLARATIONS): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}${yaml}`, 'utf8');
  };

  const taskFile = async (): Promise<string> =>
    readFile(join(project, '.boardown', 'epics', 'no_epic.md'), 'utf8');

  const getTask = async (id: string): Promise<Task> => {
    const out = await taskCommand(parseArgs(['task', 'get', id]), ctx);
    return (out.data as { task: Task }).task;
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-cf-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('sets a value and writes it flat into the task frontmatter', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    const out = await taskCommand(
      parseArgs(['task', 'edit', 'TS-1', '--field', 'reporter=alice']),
      ctx,
    );
    expect(out.data).toEqual({ id: 'TS-1' });
    expect(await taskFile()).toContain('reporter: alice');
    expect((await getTask('TS-1')).frontmatter.custom).toEqual({ reporter: 'alice' });
  });

  it('sets several fields in one call', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await taskCommand(
      parseArgs(['task', 'edit', 'TS-1', '--field', 'reporter=alice', '--field', 'env=staging']),
      ctx,
    );
    expect((await getTask('TS-1')).frontmatter.custom).toEqual({
      reporter: 'alice',
      env: 'staging',
    });
  });

  it('clears a field on an empty value', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field=reporter=alice']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field=reporter=']), ctx);
    expect((await getTask('TS-1')).frontmatter.custom).toBeUndefined();
    expect(await taskFile()).not.toContain('reporter');
  });

  it('keeps everything after the first = as the value', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field=env=a=b']), ctx);
    expect((await getTask('TS-1')).frontmatter.custom).toEqual({ env: 'a=b' });
  });

  it('sets values at creation', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T', '--field', 'env=prod']), ctx);
    expect((await getTask('TS-1')).frontmatter.custom).toEqual({ env: 'prod' });
  });

  it('rejects an undeclared key with USAGE and writes nothing', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    const before = await taskFile();
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field', 'nope=1']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE', exitCode: 2 });
    expect(await taskFile()).toBe(before);
  });

  it('rejects a --field without an =', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field', 'reporter']), ctx),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });

  it('refuses a task in a finished release', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T']), ctx);
    await releaseCommand(parseArgs(['release', 'add', '1.0']), ctx);
    await releaseCommand(parseArgs(['release', 'start', '1.0']), ctx);
    await taskCommand(parseArgs(['task', 'edit', 'TS-1', '--release', '1.0']), ctx);
    // An unfinished task is carried out of the release on completion; a done one stays.
    await taskCommand(parseArgs(['task', 'status', 'TS-1', 'done']), ctx);
    await releaseCommand(parseArgs(['release', 'done', '1.0']), ctx);
    await expect(
      taskCommand(parseArgs(['task', 'edit', 'TS-1', '--field', 'env=x']), ctx),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
  });

  it('keeps custom values out of listing summaries', async () => {
    await declare();
    await taskCommand(parseArgs(['task', 'add', 'T', '--field', 'env=prod']), ctx);
    const out = await taskCommand(parseArgs(['task', 'list']), ctx);
    expect(JSON.stringify(out.data)).not.toContain('prod');
  });

  it('schema reports the declared fields', async () => {
    await declare();
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    expect((out.data as { customFields: unknown }).customFields).toEqual([
      { key: 'reporter', label: 'Reporter', type: 'string' },
      { key: 'env', label: 'env', type: 'string' },
    ]);
  });

  it('schema adds nothing for a board that declares no fields', async () => {
    const out = await schemaCommand(parseArgs(['schema']), ctx);
    expect('customFields' in (out.data as object)).toBe(false);
  });

  it('schema still works outside a board, without the field list', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'bd-cli-nb-'));
    try {
      const out = await schemaCommand(parseArgs(['schema']), { cwd: outside, json: true });
      expect(out.data).toMatchObject({ version: 6 });
      expect((out.data as { customFields?: unknown }).customFields).toBeUndefined();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('an invalid declaration fails the board with BOARD_INVALID', async () => {
    await declare('customFields:\n  - key: status\n    type: string\n');
    await expect(taskCommand(parseArgs(['task', 'add', 'T']), ctx)).rejects.toMatchObject({
      code: 'BOARD_INVALID',
    });
    await expect(schemaCommand(parseArgs(['schema']), ctx)).rejects.toBeInstanceOf(CliError);
  });
});
