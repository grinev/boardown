import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import type { CommandContext } from '../types';
import { initCommand } from './init';
import { schemaCommand } from './schema';

describe('statusOutsideActiveRelease (cli schema)', () => {
  let project: string;
  let ctx: CommandContext;
  let configPath: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'bd-cli-status-lock-'));
    ctx = { cwd: project, json: true, dataDir: join(project, '.boardown') };
    configPath = join(project, '.boardown', 'config.yaml');
    await initCommand(parseArgs(['init', '--id-prefix', 'TS', '--project-name', 'Demo']), ctx);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('reports the setting from schema, with and without a board', async () => {
    const off = await schemaCommand(parseArgs(['schema']), ctx);
    expect(off.data).toMatchObject({ statusOutsideActiveRelease: false });

    const current = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${current}statusOutsideActiveRelease: true\n`, 'utf8');
    const on = await schemaCommand(parseArgs(['schema']), ctx);
    expect(on.data).toMatchObject({ statusOutsideActiveRelease: true });

    const outside = await schemaCommand(parseArgs(['schema']), { cwd: tmpdir(), json: true });
    expect(outside.data).toMatchObject({ statusOutsideActiveRelease: false });
  });
});
