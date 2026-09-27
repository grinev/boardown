import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import skillText from '../../skills/boardown/SKILL.md';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { skillCommand } from './skill';

interface Row {
  agent: string;
  path: string;
  result: string;
}

const skillFile = (root: string, dir: '.claude' | '.agents'): string =>
  join(root, dir, 'skills', 'boardown', 'SKILL.md');

describe('skill install (cli)', () => {
  let project: string;
  let home: string;
  let ctx: CommandContext;

  const install = async (...argv: string[]): Promise<Row[]> => {
    const out = await skillCommand(parseArgs(['skill', 'install', ...argv]), ctx);
    expect(out.data).toMatchObject({ skill: 'boardown' });
    return (out.data as { installed: Row[] }).installed;
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-skill-'));
    home = await mkdtemp(join(tmpdir(), 'bd-cli-skill-home-'));
    // os.homedir() reads USERPROFILE on Windows and HOME elsewhere; the real
    // home directory is never touched.
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    ctx = { cwd: project, json: true };
    await initCommand(parseArgs(['init', '--id-prefix', 'TS']), ctx);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(project, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it('embeds the skill page byte for byte', async () => {
    const source = fileURLToPath(new URL('../../skills/boardown/SKILL.md', import.meta.url));
    const onDisk = await readFile(source, 'utf8');
    expect(skillText).toBe(onDisk);
    expect(skillText.startsWith('---\nname: boardown\n')).toBe(true);
  });

  it('writes each agent into its directory next to .boardown/', async () => {
    const rows = await install('claude', 'codex');
    expect(rows).toEqual([
      { agent: 'claude', path: skillFile(project, '.claude'), result: 'created' },
      { agent: 'codex', path: skillFile(project, '.agents'), result: 'created' },
    ]);
    expect(await readFile(skillFile(project, '.claude'), 'utf8')).toBe(skillText);
    expect(await readFile(skillFile(project, '.agents'), 'utf8')).toBe(skillText);
  });

  it('finds the project from a subdirectory, and through --data-dir', async () => {
    const nested = join(project, 'src', 'deep');
    await mkdir(nested, { recursive: true });
    ctx = { cwd: nested, json: true };
    expect(await install('claude')).toEqual([
      { agent: 'claude', path: skillFile(project, '.claude'), result: 'created' },
    ]);

    const elsewhere = await mkdtemp(join(tmpdir(), 'bd-cli-skill-cwd-'));
    try {
      ctx = { cwd: elsewhere, json: true, dataDir: join(project, '.boardown') };
      expect(await install('opencode')).toEqual([
        { agent: 'opencode', path: skillFile(project, '.agents'), result: 'created' },
      ]);
      expect(await readdir(elsewhere)).toEqual([]);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it('--global writes under the home directory and needs no board', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'bd-cli-skill-nb-'));
    try {
      ctx = { cwd: outside, json: true };
      expect(await install('claude', 'agents', '--global')).toEqual([
        { agent: 'claude', path: skillFile(home, '.claude'), result: 'created' },
        { agent: 'agents', path: skillFile(home, '.agents'), result: 'created' },
      ]);
      expect(await readFile(skillFile(home, '.claude'), 'utf8')).toBe(skillText);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('reports created, then unchanged without rewriting, then updated', async () => {
    const path = skillFile(project, '.claude');
    expect((await install('claude'))[0]?.result).toBe('created');
    const written = (await stat(path)).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await install('claude'))[0]?.result).toBe('unchanged');
    expect((await stat(path)).mtimeMs).toBe(written);

    await writeFile(path, skillText.replace(/\n/g, '\r\n'), 'utf8');
    expect((await install('claude'))[0]?.result).toBe('updated');
    expect(await readFile(path, 'utf8')).toBe(skillText);
  });

  it('agents sharing .agents/skills get one file and one result; a repeat is reported once', async () => {
    await mkdir(join(project, '.agents', 'skills', 'boardown'), { recursive: true });
    await writeFile(skillFile(project, '.agents'), 'an older page', 'utf8');
    const rows = await install('codex', 'opencode', 'codex', 'agents');
    const path = skillFile(project, '.agents');
    expect(rows).toEqual([
      { agent: 'codex', path, result: 'updated' },
      { agent: 'opencode', path, result: 'updated' },
      { agent: 'agents', path, result: 'updated' },
    ]);
  });

  it('prints one line per agent for a human', async () => {
    const out = await skillCommand(parseArgs(['skill', 'install', 'claude', 'codex']), ctx);
    expect(out.human).toBe(
      [
        `claude → ${skillFile(project, '.claude')} (created)`,
        `codex → ${skillFile(project, '.agents')} (created)`,
      ].join('\n'),
    );
  });

  it('refuses a bad call with USAGE and writes nothing', async () => {
    const usage = { code: 'USAGE', exitCode: 2 };
    const call = async (...argv: string[]) => skillCommand(parseArgs(['skill', ...argv]), ctx);
    await expect(call('install')).rejects.toMatchObject(usage);
    await expect(call('install', 'claude', 'cursor')).rejects.toMatchObject(usage);
    await expect(call('install', 'claude', 'cursor')).rejects.toThrow(
      'claude | codex | opencode | agents',
    );
    await expect(call('install', 'Claude')).rejects.toMatchObject(usage);
    await expect(call('bogus')).rejects.toMatchObject(usage);
    await expect(call()).rejects.toMatchObject(usage);
    ctx = { ...ctx, dataDir: join(project, '.boardown') };
    await expect(call('install', 'claude', '--global')).rejects.toMatchObject(usage);

    expect((await readdir(project)).sort()).toEqual(['.boardown']);
    expect(await readdir(home)).toEqual([]);
  });

  it('refuses a missing, config-less, unparseable or too-new board, writing nothing', async () => {
    const refused = async (code: string): Promise<void> => {
      await expect(install('claude')).rejects.toMatchObject({ code, exitCode: 1 });
      expect((await readdir(ctx.cwd)).includes('.claude')).toBe(false);
    };
    const configPath = join(project, '.boardown', 'config.yaml');

    await writeFile(configPath, 'idPrefix: [unclosed\n', 'utf8');
    await refused('BOARD_INVALID');

    await writeFile(configPath, 'idPrefix: TS\nnextId: 1\nprojectName: Demo\nminVersion: 99.0.0\n', 'utf8');
    await refused('VERSION_TOO_OLD');

    await rm(configPath);
    await refused('NO_BOARD');

    const outside = await mkdtemp(join(tmpdir(), 'bd-cli-skill-nb-'));
    try {
      ctx = { cwd: outside, json: true };
      await refused('NO_BOARD');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
