import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIN_COMPATIBLE_VERSION } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { okEnvelope } from '../output';
import type { CommandContext } from '../types';
import { taskCommand } from './task';
import { schemaCommand } from './schema';

const section = (id: string, title: string, date?: string) =>
  `## ${title}\n\n---\nid: ${id}\ntype: tech\nstatus: todo\norder: 100\n${date ? `createdAt: "${date}"\n` : ''}---\n\n`;
const first = '2026-01-01T00:00:00.000Z';
const later = '2026-01-02T00:00:00.000Z';

describe('duplicate task IDs through the CLI', () => {
  let root: string;
  let ctx: CommandContext;
  const config = 'projectName: Test\nidPrefix: BD\nnextId: 10\n';
  const original =
    section('BD-1', 'Old', first) + section('BD-1', 'Younger', later) + section('BD-2', 'Unique');
  const task = async (...args: string[]) => taskCommand(parseArgs(['task', ...args]), ctx);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'boardown-repair-'));
    ctx = { cwd: root, dataDir: join(root, '.boardown'), json: true };
    await mkdir(ctx.dataDir ?? '');
    await writeFile(join(root, '.boardown', 'config.yaml'), config);
    await writeFile(join(root, '.boardown', 'backlog.md'), original);
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it('lists both copies and rejects ambiguous primary and secondary arguments without writing', async () => {
    const listed = await task('list');
    expect(listed.data).toMatchObject({ count: 3 });
    expect(listed.problems?.[0]?.duplicateTaskIds?.copies).toHaveLength(2);
    for (const args of [
      ['get', 'BD-2', 'BD-1'],
      ['commits', 'BD-1'],
      ['attachment', 'ls', 'BD-1'],
      ['reorder', 'BD-2', '--before', 'BD-1'],
      ['link', 'add', 'BD-2', 'BD-1'],
      ['add', 'New', '--link', 'BD-1'],
      ['rm', 'BD-1'],
    ]) {
      await expect(task(...args)).rejects.toMatchObject({ code: 'AMBIGUOUS_TASK_ID' });
    }
    expect(await readFile(join(root, '.boardown', 'backlog.md'), 'utf8')).toBe(original);
    expect(await readFile(join(root, '.boardown', 'config.yaml'), 'utf8')).toBe(config);
  });

  it('reports explicit, unique and missing outcomes, and publishes the contract', async () => {
    const repaired = await task('repair-ids', 'BD-1');
    expect(repaired.data).toEqual({
      repairs: [{ oldId: 'BD-1', newId: 'BD-10', title: 'Younger', file: 'backlog.md' }],
    });
    expect(repaired.human).toContain('BD-1 → BD-10');
    expect(await readFile(join(root, '.boardown', 'config.yaml'), 'utf8')).toContain(
      `minVersion: ${MIN_COMPATIBLE_VERSION}`,
    );
    expect((await task('repair-ids', 'BD-1')).data).toEqual({ repairs: [] });
    await expect(task('repair-ids', 'BD-900')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    const schema = await schemaCommand(parseArgs(['schema']), ctx);
    const data = schema.data as {
      commands: { name: string }[];
      errorCodes: Record<string, string>;
    };
    expect(data.commands.some(({ name }) => name === 'task repair-ids')).toBe(true);
    expect(Object.keys(data.errorCodes)).toContain('AMBIGUOUS_TASK_ID');
    expect(Object.keys(data.errorCodes)).toContain('DUPLICATE_ID_REPAIR_BLOCKED');
  });

  it('reports automatic repair outside the unchanged acknowledgement only on real writes', async () => {
    expect((await task('edit', 'BD-2', '--title', 'Unique')).repairs).toBeUndefined();
    const result = await task('add', 'Ordinary addition');
    expect(okEnvelope(result.data, result.problems ?? [], result.repairs)).toEqual({
      ok: true,
      data: { id: 'BD-10' },
      repairs: [{ oldId: 'BD-1', newId: 'BD-11', title: 'Younger', file: 'backlog.md' }],
    });
    expect(result.human).toContain('BD-1 → BD-11');
  });

  it('reports a rendered Docs reference and leaves a blocked duplicate readable during other edits', async () => {
    await mkdir(join(root, '.boardown', 'docs'));
    await writeFile(join(root, '.boardown', 'docs', 'refs.md'), '**BD-1**');
    const result: unknown = await task('repair-ids', 'BD-1').catch((error: unknown) => error);
    expect(result).toHaveProperty('code', 'DUPLICATE_ID_REPAIR_BLOCKED');
    expect(result).toHaveProperty('problems.1.file', 'docs/refs.md');
    expect((await task('edit', 'BD-2', '--title', 'Allowed')).repairs).toBeUndefined();
    expect(await readFile(join(root, '.boardown', 'backlog.md'), 'utf8')).toContain('## Allowed');
    await expect(task('get', 'BD-1')).rejects.toMatchObject({ code: 'AMBIGUOUS_TASK_ID' });
  });
});
