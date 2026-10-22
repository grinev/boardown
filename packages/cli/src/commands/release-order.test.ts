import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { archiveCommand } from './archive';
import { backlogCommand } from './backlog';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { taskCommand } from './task';

interface Named {
  slug: string;
}

const slugs = (data: unknown, key: string): string[] =>
  (data as Record<string, Named[]>)[key]?.map((r) => r.slug) ?? [];

describe('release order and dates (cli)', () => {
  let project: string;
  let ctx: CommandContext;

  const run = (...argv: string[]) => releaseCommand(parseArgs(['release', ...argv]), ctx);
  const onDay = (day: string): void => {
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`));
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    project = await mkdtemp(join(tmpdir(), 'bd-cli-release-order-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    const configPath = join(project, '.boardown', 'config.yaml');
    await writeFile(
      configPath,
      `${await readFile(configPath, 'utf8')}multipleActiveReleases: true\n`,
      'utf8',
    );
    for (const name of ['v0.10.0', 'v0.9.0', 'v0.11.0', 'v0.2.0']) await run('add', name);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(project, { recursive: true, force: true });
  });

  it('lists releases by version in every view', async () => {
    await run('start', 'v0.10.0');
    await run('start', 'v0.9.0');
    for (const slug of ['v0.11.0', 'v0.2.0', 'v0.9.0', 'v0.10.0']) {
      await taskCommand(parseArgs(['task', 'add', `in ${slug}`, '--release', slug]), ctx);
    }

    const backlog = await backlogCommand(parseArgs(['backlog']), ctx);
    expect((backlog.data as { sections: { key: string }[] }).sections.map((s) => s.key)).toEqual([
      'v0.9.0',
      'v0.10.0',
      'v0.2.0',
      'v0.11.0',
      'backlog',
    ]);
    expect(slugs((await run('current', '--all')).data, 'releases')).toEqual(['v0.9.0', 'v0.10.0']);
    expect((await run('current')).data).toMatchObject({ release: { slug: 'v0.9.0' } });
    expect(slugs((await run('list')).data, 'releases')).toEqual([
      'v0.2.0',
      'v0.9.0',
      'v0.10.0',
      'v0.11.0',
    ]);

    const list = await taskCommand(parseArgs(['task', 'list']), ctx);
    expect(
      (list.data as { tasks: { title: string }[] }).tasks.map((t) => t.title),
    ).toEqual(['in v0.9.0', 'in v0.10.0', 'in v0.2.0', 'in v0.11.0']);
  });

  it('records the start and completion days, and the archive reads newest first', async () => {
    onDay('2026-10-01');
    await run('start', 'v0.10.0');
    const file = join(project, '.boardown', 'releases', 'v0.10.0.md');
    expect(await readFile(file, 'utf8')).toContain('startDate: "2026-10-01"');

    onDay('2026-10-05');
    await run('done', 'v0.10.0');
    expect(await readFile(file, 'utf8')).toContain('endDate: "2026-10-05"');
    expect((await run('get', 'v0.10.0')).data).toMatchObject({
      release: { startDate: '2026-10-01', endDate: '2026-10-05' },
    });

    // Completed the same day as v0.10.0, then one finished by hand with no date.
    await run('start', 'v0.9.0');
    await run('done', 'v0.9.0');
    await run('start', 'v0.11.0');
    await run('done', 'v0.11.0');
    const legacy = join(project, '.boardown', 'releases', 'v0.11.0.md');
    await writeFile(
      legacy,
      (await readFile(legacy, 'utf8')).replace(/^(startDate|endDate): .*\n/gm, ''),
      'utf8',
    );

    onDay('2026-10-20');
    await run('start', 'v0.2.0');
    await run('done', 'v0.2.0');

    const archive = await archiveCommand(parseArgs(['archive']), ctx);
    expect(slugs(archive.data, 'releases')).toEqual(['v0.2.0', 'v0.10.0', 'v0.9.0', 'v0.11.0']);
  });
});
