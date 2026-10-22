import { appendFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { backlogCommand } from './backlog';
import { initCommand } from './init';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

const CREATED = '2026-10-22T10:00:00.000Z';
const EDITED = '2026-10-23T11:30:00.000Z';

describe('task dates (cli)', () => {
  let project: string;
  let ctx: CommandContext;

  const run = (...argv: string[]) => taskCommand(parseArgs(['task', ...argv]), ctx);
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  const backlogFile = () => join(project, '.boardown', 'backlog.md');
  const frontmatterOf = async (id: string) => {
    const out = await run('get', id);
    return (out.data as { tasks: { task: Task }[] }).tasks[0]?.task.frontmatter;
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-dates-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    vi.useFakeTimers({ toFake: ['Date'] });
    at(CREATED);
    await run('add', 'T');
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(project, { recursive: true, force: true });
  });

  it('stamps both dates on add and updatedAt alone on an edit', async () => {
    expect(await frontmatterOf('TS-1')).toMatchObject({ createdAt: CREATED, updatedAt: CREATED });
    at(EDITED);
    await run('edit', 'TS-1', '--title', 'New');
    expect(await frontmatterOf('TS-1')).toMatchObject({ createdAt: CREATED, updatedAt: EDITED });
  });

  it('writes nothing for an edit that changes nothing', async () => {
    const before = await stat(backlogFile());
    at(EDITED);
    await run('edit', 'TS-1', '--title', 'T');
    expect((await stat(backlogFile())).mtimeMs).toBe(before.mtimeMs);
    expect((await frontmatterOf('TS-1'))?.updatedAt).toBe(CREATED);
  });

  it('prints the stored strings in task get, Updated only while tracked', async () => {
    const shown = (await run('get', 'TS-1')).human;
    expect(shown).toContain(`Created: ${CREATED}\nUpdated: ${CREATED}`);

    await appendFile(join(project, '.boardown', 'config.yaml'), 'trackUpdatedAt: false\n');
    const untracked = (await run('get', 'TS-1')).human;
    expect(untracked).toContain(`Created: ${CREATED}`);
    expect(untracked).not.toContain('Updated:');
  });

  it('stops stamping when tracking is off, keeping the stored value', async () => {
    await appendFile(join(project, '.boardown', 'config.yaml'), 'trackUpdatedAt: false\n');
    at(EDITED);
    await run('edit', 'TS-1', '--title', 'Renamed');
    expect(await readFile(backlogFile(), 'utf8')).toContain(`updatedAt: "${CREATED}"`);
  });

  it('carries the dates under --full and keeps them out of summaries', async () => {
    const plain = await backlogCommand(parseArgs(['backlog']), ctx);
    const summary = (plain.data as { sections: { tasks: object[] }[] }).sections[0]?.tasks[0];
    expect(summary).not.toHaveProperty('createdAt');
    expect(summary).not.toHaveProperty('updatedAt');

    const full = await backlogCommand(parseArgs(['backlog', '--full']), ctx);
    const task = (full.data as { sections: { tasks: Task[] }[] }).sections[0]?.tasks[0];
    expect(task?.frontmatter).toMatchObject({ createdAt: CREATED, updatedAt: CREATED });
  });

  it('lists both fields in schema and reports the setting, on unless the board says false', async () => {
    const on = await schemaCommand(parseArgs(['schema']), ctx);
    expect(on.data).toMatchObject({ trackUpdatedAt: true });
    expect(Object.keys((on.data as { taskFields: object }).taskFields)).toEqual(
      expect.arrayContaining(['createdAt', 'updatedAt']),
    );

    await appendFile(join(project, '.boardown', 'config.yaml'), 'trackUpdatedAt: false\n');
    const off = await schemaCommand(parseArgs(['schema']), ctx);
    expect(off.data).toMatchObject({ trackUpdatedAt: false });

    const outside = await schemaCommand(parseArgs(['schema']), { cwd: tmpdir(), json: true });
    expect(outside.data).toMatchObject({ trackUpdatedAt: true });
  });
});
