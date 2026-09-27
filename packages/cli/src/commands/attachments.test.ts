import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATTACHMENT_MAX_BYTES } from '@boardown/core';
import { parseArgs } from '../args';
import { CliError } from '../output';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';
import { taskCommand } from './task';

describe('task attachments (cli)', () => {
  let project: string;
  let ctx: CommandContext;

  const run = (...argv: string[]) => taskCommand(parseArgs(['task', ...argv]), ctx);
  const folder = (id: string) => join(project, '.boardown', 'attachments', id);
  const code = async (result: ReturnType<typeof run>): Promise<string> => {
    try {
      await Promise.resolve(result);
    } catch (err) {
      if (err instanceof CliError) return err.code;
      throw err;
    }
    throw new Error('expected a refusal');
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-attach-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    await mkdir(join(project, 'src', 'shots'), { recursive: true });
    await writeFile(join(project, 'src', 'shots', 'shot.png'), Buffer.from([0, 0xff, 0x80]));
    await writeFile(join(project, 'notes.txt'), 'hello');
    await run('add', 'T');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('adds files under their own names, suffixing a taken one, and lists them', async () => {
    const first = await run('attachment', 'add', 'TS-1', 'src/shots/shot.png', 'notes.txt');
    expect(first.data).toEqual({ id: 'TS-1', added: ['shot.png', 'notes.txt'] });
    const second = await run('attachment', 'add', 'TS-1', join(project, 'src', 'shots', 'shot.png'));
    expect(second.data).toEqual({ id: 'TS-1', added: ['shot (1).png'] });
    expect(new Uint8Array(await readFile(join(folder('TS-1'), 'shot.png')))).toEqual(
      new Uint8Array([0, 0xff, 0x80]),
    );

    const listed = await run('attachment', 'ls', 'TS-1');
    expect(listed.data).toEqual([
      { name: 'notes.txt', size: 5, path: '.boardown/attachments/TS-1/notes.txt' },
      { name: 'shot (1).png', size: 3, path: '.boardown/attachments/TS-1/shot (1).png' },
      { name: 'shot.png', size: 3, path: '.boardown/attachments/TS-1/shot.png' },
    ]);
  });

  it('lists none as an empty array', async () => {
    expect((await run('attachment', 'ls', 'TS-1')).data).toEqual([]);
  });

  it('refuses the whole add when one source is missing, a directory, or over the cap', async () => {
    await writeFile(join(project, 'big.bin'), Buffer.alloc(ATTACHMENT_MAX_BYTES + 1));
    expect(await code(run('attachment', 'add', 'TS-1', 'notes.txt', 'nope.txt'))).toBe(
      'FILE_NOT_FOUND',
    );
    expect(await code(run('attachment', 'add', 'TS-1', 'notes.txt', 'src'))).toBe('FILE_NOT_FOUND');
    expect(await code(run('attachment', 'add', 'TS-1', 'notes.txt', 'big.bin'))).toBe(
      'FILE_TOO_LARGE',
    );
    expect(await readdir(join(project, '.boardown'))).not.toContain('attachments');
  });

  it('answers TASK_NOT_FOUND and ATTACHMENT_NOT_FOUND', async () => {
    expect(await code(run('attachment', 'add', 'TS-9', 'notes.txt'))).toBe('TASK_NOT_FOUND');
    expect(await code(run('attachment', 'ls', 'TS-9'))).toBe('TASK_NOT_FOUND');
    expect(await code(run('attachment', 'rm', 'TS-1', 'nope.txt'))).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('removes one file, and the folder with the last one', async () => {
    await run('attachment', 'add', 'TS-1', 'notes.txt', 'src/shots/shot.png');
    expect((await run('attachment', 'rm', 'TS-1', 'notes.txt')).data).toEqual({ id: 'TS-1' });
    expect(await readdir(folder('TS-1'))).toEqual(['shot.png']);
    await run('attachment', 'rm', 'TS-1', 'shot.png');
    expect(await readdir(join(project, '.boardown', 'attachments'))).toEqual([]);
  });

  it('lands --attach with the new task, all or nothing', async () => {
    const out = await run('add', 'U', '--attach', 'notes.txt', '--attach', 'src/shots/shot.png');
    expect(out.data).toEqual({ id: 'TS-2' });
    expect((await readdir(folder('TS-2'))).sort()).toEqual(['notes.txt', 'shot.png']);

    expect(await code(run('add', 'V', '--attach', 'notes.txt', '--attach', 'gone.txt'))).toBe(
      'FILE_NOT_FOUND',
    );
    expect((await run('get', 'TS-3')).data).toMatchObject({ missing: ['TS-3'] });
  });

  it('removes the folder, whatever it holds, with task rm', async () => {
    await run('attachment', 'add', 'TS-1', 'notes.txt');
    await mkdir(join(folder('TS-1'), 'sub'));
    await writeFile(join(folder('TS-1'), 'sub', 'by-hand.txt'), 'x');
    expect((await run('rm', 'TS-1')).data).toEqual({ id: 'TS-1' });
    expect(await readdir(join(project, '.boardown', 'attachments'))).toEqual([]);
  });

  it('refuses add and rm in a finished release, and still lists', async () => {
    await run('attachment', 'add', 'TS-1', 'notes.txt');
    const rel = await releaseCommand(parseArgs(['release', 'add', 'Old']), ctx);
    const slug = (rel.data as { slug: string }).slug;
    await releaseCommand(parseArgs(['release', 'start', slug]), ctx);
    await run('edit', 'TS-1', '--release', slug);
    await run('status', 'TS-1', 'done');
    await releaseCommand(parseArgs(['release', 'done', slug]), ctx);

    expect(await code(run('attachment', 'add', 'TS-1', 'notes.txt'))).toBe('ARCHIVED');
    expect(await code(run('attachment', 'rm', 'TS-1', 'notes.txt'))).toBe('ARCHIVED');
    expect(((await run('attachment', 'ls', 'TS-1')).data as unknown[]).length).toBe(1);
  });

  it('reports the cap and the subcommands in schema', async () => {
    const data = (await schemaCommand(parseArgs(['schema']), ctx)).data as {
      attachmentMaxBytes: number;
      commands: { name: string; usage: string }[];
    };
    expect(data.attachmentMaxBytes).toBe(25 * 1024 * 1024);
    expect(data.commands.some((c) => c.name === 'task attachment')).toBe(true);
    expect(data.commands.find((c) => c.name === 'task add')?.usage).toContain('--attach <file>');
  });
});
