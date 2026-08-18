import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { backlogCommand } from './backlog';
import { initCommand } from './init';
import { releaseCommand } from './release';
import { schemaCommand } from './schema';

interface ReleaseRecord {
  slug: string;
  status: string;
}

describe('multiple active releases (cli)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  // No CLI command writes a setting, so the board's own config is edited the way
  // the WIP-limit tests do it.
  const appendConfig = async (yaml: string): Promise<void> => {
    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}${yaml}`, 'utf8');
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-active-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'v1.0']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'v2.0']), ctx);
    await releaseCommand(parseArgs(['release', 'start', 'v1.0']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('refuses a second start while the setting is off', async () => {
    await expect(
      releaseCommand(parseArgs(['release', 'start', 'v2.0']), ctx),
    ).rejects.toMatchObject({ code: 'RELEASE_CONFLICT' });
  });

  it('starts a second release while the setting is on', async () => {
    await appendConfig('multipleActiveReleases: true\n');
    await releaseCommand(parseArgs(['release', 'start', 'v2.0']), ctx);

    const out = await releaseCommand(parseArgs(['release', 'list']), ctx);
    const { releases } = out.data as { releases: ReleaseRecord[] };
    expect(releases.filter((r) => r.status === 'current').map((r) => r.slug).sort()).toEqual([
      'v1.0',
      'v2.0',
    ]);
  });

  it('gives backlog one section per active release, ahead of the future ones', async () => {
    await appendConfig('multipleActiveReleases: true\n');
    await releaseCommand(parseArgs(['release', 'start', 'v2.0']), ctx);
    await releaseCommand(parseArgs(['release', 'add', 'v3.0']), ctx);

    const out = await backlogCommand(parseArgs(['backlog']), ctx);
    const { sections } = out.data as { sections: { key: string; status: string | null }[] };
    expect(sections.map((s) => s.key)).toEqual(['v1.0', 'v2.0', 'v3.0', 'backlog']);
    expect(sections.map((s) => s.status)).toEqual(['current', 'current', 'future', null]);
  });

  it('follows the stored board release, and falls back when it is no longer active', async () => {
    await appendConfig('boardRelease: v2.0\nmultipleActiveReleases: true\n');
    await releaseCommand(parseArgs(['release', 'start', 'v2.0']), ctx);

    const chosen = await releaseCommand(parseArgs(['release', 'current']), ctx);
    expect((chosen.data as { release: ReleaseRecord }).release.slug).toBe('v2.0');

    await releaseCommand(parseArgs(['release', 'done', 'v2.0']), ctx);
    const after = await releaseCommand(parseArgs(['release', 'current']), ctx);
    expect((after.data as { release: ReleaseRecord }).release.slug).toBe('v1.0');
  });

  it('returns every active release under --all, and an empty list with none', async () => {
    await appendConfig('multipleActiveReleases: true\n');
    await releaseCommand(parseArgs(['release', 'start', 'v2.0']), ctx);

    const all = await releaseCommand(parseArgs(['release', 'current', '--all']), ctx);
    expect((all.data as { releases: ReleaseRecord[] }).releases.map((r) => r.slug)).toEqual([
      'v1.0',
      'v2.0',
    ]);

    await releaseCommand(parseArgs(['release', 'done', 'v1.0']), ctx);
    await releaseCommand(parseArgs(['release', 'done', 'v2.0']), ctx);
    const none = await releaseCommand(parseArgs(['release', 'current', '--all']), ctx);
    expect((none.data as { releases: ReleaseRecord[] }).releases).toEqual([]);
    const single = await releaseCommand(parseArgs(['release', 'current']), ctx);
    expect((single.data as { release: unknown }).release).toBeNull();
  });

  it('carries the stored release through a rename', async () => {
    await appendConfig('boardRelease: v1.0\n');
    await releaseCommand(parseArgs(['release', 'edit', 'v1.0', '--name', 'v1.1']), ctx);

    expect(await readFile(configPath, 'utf8')).toContain('boardRelease: v1.1');
  });

  it('reports the setting from schema, with and without a board', async () => {
    const off = await schemaCommand(parseArgs(['schema']), ctx);
    expect(off.data).toMatchObject({ multipleActiveReleases: false });

    await appendConfig('multipleActiveReleases: true\n');
    const on = await schemaCommand(parseArgs(['schema']), ctx);
    expect(on.data).toMatchObject({ multipleActiveReleases: true });

    const outside = await schemaCommand(parseArgs(['schema']), { cwd: tmpdir(), json: true });
    expect(outside.data).toMatchObject({ multipleActiveReleases: false });
  });
});
