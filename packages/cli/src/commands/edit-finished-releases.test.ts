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

describe('editFinishedReleases (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;
  let shipped: string;
  let next: string;

  const task = (...argv: string[]) => taskCommand(parseArgs(['task', ...argv]), ctx);
  const release = (...argv: string[]) => releaseCommand(parseArgs(['release', ...argv]), ctx);
  const code = async (result: unknown): Promise<string> => {
    try {
      await Promise.resolve(result);
    } catch (err) {
      if (err instanceof CliError) return err.code;
      throw err;
    }
    throw new Error('expected a refusal');
  };
  const setKey = async (line: string): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}${line}\n`, 'utf8');
  };
  const slugOf = (out: { data: unknown }): string => (out.data as { slug: string }).slug;
  const releaseOf = async (id: string): Promise<string | undefined> => {
    const out = await task('get', id);
    const entry = (out.data as { tasks: { in: { kind: string; file: string } }[] }).tasks[0]!;
    return entry.in.kind === 'release' ? entry.in.file : undefined;
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-edit-finished-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    shipped = slugOf(await release('add', 'Shipped'));
    await release('start', shipped);
    await task('add', 'First', '--release', shipped);
    await task('add', 'Second', '--release', shipped);
    await task('status', 'TS-1', 'done');
    await task('status', 'TS-2', 'done');
    await release('done', shipped);
    next = slugOf(await release('add', 'Next'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('reports the setting from schema, with and without a board', async () => {
    const off = await schemaCommand(parseArgs(['schema']), ctx);
    expect(off.data).toMatchObject({ editFinishedReleases: false });
    await setKey('editFinishedReleases: true');
    const on = await schemaCommand(parseArgs(['schema']), ctx);
    expect(on.data).toMatchObject({ editFinishedReleases: true });
    const outside = await schemaCommand(parseArgs(['schema']), { cwd: tmpdir(), json: true });
    expect(outside.data).toMatchObject({ editFinishedReleases: false });
  });

  it('keeps a finished release frozen while the key is off', async () => {
    await setKey('editFinishedReleases: false');
    expect(await code(task('edit', 'TS-1', '--title', 'X'))).toBe('ARCHIVED');
    expect(await code(task('add', 'Late', '--release', shipped))).toBe('ARCHIVED');
    expect(await code(release('edit', shipped, '--name', 'Renamed'))).toBe('ARCHIVED');
  });

  it('lets every content command through with the key on', async () => {
    await setKey('editFinishedReleases: true');
    await task('edit', 'TS-1', '--title', 'Retitled');
    await task('checklist', 'add', 'TS-1', 'step');
    await task('notes', 'add', 'TS-1', 'a note');
    await task('label', 'add', 'TS-1', 'ui');
    await task('reorder', 'TS-2', '--up');
    await writeFile(join(project, 'shot.png'), Buffer.from([1, 2, 3]));
    await task('attachment', 'add', 'TS-1', 'shot.png');
    await task('attachment', 'rm', 'TS-1', 'shot.png');
    await task('add', 'Late', '--release', shipped);
    expect(await releaseOf('TS-3')).toBe(`releases/${shipped}.md`);
    await task('rm', 'TS-3');

    const got = await task('get', 'TS-1');
    const first = (got.data as { tasks: { task: { title: string; frontmatter: { labels?: string[] } } }[] })
      .tasks[0]!.task;
    expect(first.title).toBe('Retitled');
    expect(first.frontmatter.labels).toEqual(['ui']);
  });

  it('moves a task out of and back into a finished release', async () => {
    await setKey('editFinishedReleases: true');
    await task('edit', 'TS-1', '--release', next);
    expect(await releaseOf('TS-1')).toBe(`releases/${next}.md`);
    await task('edit', 'TS-1', '--release', shipped);
    expect(await releaseOf('TS-1')).toBe(`releases/${shipped}.md`);
  });

  it('still needs statusOutsideActiveRelease to change a status there', async () => {
    await setKey('editFinishedReleases: true');
    expect(await code(task('status', 'TS-1', 'todo'))).toBe('STATUS_LOCKED');
    expect(await code(task('add', 'Late', '--release', shipped, '--status', 'done'))).toBe(
      'STATUS_LOCKED',
    );
    await setKey('statusOutsideActiveRelease: true');
    await task('status', 'TS-1', 'todo');
  });

  it('renames a finished release, and a taken name is RELEASE_INVALID, not ARCHIVED', async () => {
    await setKey('editFinishedReleases: true');
    const renamed = await release('edit', shipped, '--name', 'Shipped again');
    const slug = (renamed.data as { slug: string }).slug;
    expect(slug).not.toBe(shipped);
    expect(await code(release('edit', slug, '--name', 'Next'))).toBe('RELEASE_INVALID');
  });
});
