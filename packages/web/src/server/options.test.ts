import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UsageError, parseArgs, resolveMode } from './options';
import { BOARD_DIR_NAME } from './roots';

const made: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-options-'));
  made.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('parseArgs', () => {
  it('takes no arguments at all', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('reads a flag and its value as two arguments', () => {
    expect(parseArgs(['--data-dir', '/boards/.boardown'])).toEqual({
      dataDir: '/boards/.boardown',
    });
  });

  it('reads the --flag=value form', () => {
    expect(parseArgs(['--registry=/projects.yaml', '--port=7777'])).toEqual({
      registry: '/projects.yaml',
      port: 7777,
    });
  });

  it('refuses a flag with no value', () => {
    expect(() => parseArgs(['--data-dir'])).toThrow(UsageError);
    expect(() => parseArgs(['--registry='])).toThrow(UsageError);
  });

  it('refuses an unknown argument', () => {
    expect(() => parseArgs(['--watch'])).toThrow(UsageError);
  });

  it('refuses a port that is not one', () => {
    expect(() => parseArgs(['--port', 'soon'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '70000'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '-1'])).toThrow(UsageError);
  });

  it('refuses the two root flags together, naming both', () => {
    expect(() => parseArgs(['--data-dir', '/a/.boardown', '--registry', '/b.yaml'])).toThrow(
      /--data-dir and --registry/,
    );
  });
});

const writeRegistry = async (file: string, project: string): Promise<void> => {
  await fs.writeFile(file, `projects:\n  shop: ${project.replace(/\\/g, '/')}\n`, 'utf-8');
};

/** Nothing under test may ask for it; a case that expects it to be asked names its own. */
const noDefault = (): string => {
  throw new Error('the default registry path was asked for');
};

describe('resolveMode', () => {
  it('treats --data-dir as the board folder itself', async () => {
    const dir = await tempDir();
    const board = path.join(dir, BOARD_DIR_NAME);
    const resolved = await resolveMode({ dataDir: board }, dir, noDefault);
    expect(resolved.singleRoots).toEqual({ projectRoot: dir, boardRoot: board });
  });

  it('resolves a relative --data-dir against the working directory', async () => {
    const dir = await tempDir();
    const resolved = await resolveMode({ dataDir: BOARD_DIR_NAME }, dir, noDefault);
    expect(resolved.singleRoots?.boardRoot).toBe(path.join(dir, BOARD_DIR_NAME));
  });

  it('treats a registry entry as a project folder', async () => {
    const dir = await tempDir();
    const project = path.join(dir, 'shop');
    const file = path.join(dir, 'projects.yaml');
    await writeRegistry(file, project);
    const resolved = await resolveMode({ registry: file }, dir, noDefault);
    expect(resolved.singleRoots).toBeNull();
    const entries = (await resolved.registry?.read())?.entries ?? [];
    expect(entries[0]).toMatchObject({
      id: 'shop',
      projectRoot: project,
      boardRoot: path.join(project, BOARD_DIR_NAME),
    });
  });

  it('refuses a registry that cannot be read, naming the file', async () => {
    const dir = await tempDir();
    const missing = path.join(dir, 'nope.yaml');
    await expect(resolveMode({ registry: missing }, dir, noDefault)).rejects.toThrow(missing);
  });

  it('refuses a registry that does not validate', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, 'projects:\n  "My Shop": /somewhere\n', 'utf-8');
    await expect(resolveMode({ registry: file }, dir, noDefault)).rejects.toThrow(/lowercase/);
  });

  it('serves the default registry when neither flag is given', async () => {
    const dir = await tempDir();
    const project = path.join(dir, 'shop');
    const file = path.join(dir, 'default.yaml');
    await writeRegistry(file, project);
    const resolved = await resolveMode({}, dir, () => file);
    expect(resolved.singleRoots).toBeNull();
    expect(resolved.registry?.filePath).toBe(file);
    const entries = (await resolved.registry?.read())?.entries ?? [];
    expect(entries.map((entry) => entry.id)).toEqual(['shop']);
  });

  it('starts on a default registry that is not there, listing nothing', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'default.yaml');
    const resolved = await resolveMode({}, dir, () => file);
    expect(resolved.registry?.filePath).toBe(file);
    expect(await resolved.registry?.read()).toEqual({ entries: [], staleReason: null });
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it('refuses a default registry that does not validate, naming the file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'default.yaml');
    await fs.writeFile(file, 'projects:\n  "My Shop": /somewhere\n', 'utf-8');
    await expect(resolveMode({}, dir, () => file)).rejects.toThrow(file);
  });

  it('lets the default path refuse to resolve, and does not ask for it otherwise', async () => {
    const dir = await tempDir();
    const board = path.join(dir, BOARD_DIR_NAME);
    const unresolvable = (): string => {
      throw new Error('no home directory is set');
    };
    await expect(resolveMode({}, dir, unresolvable)).rejects.toThrow(/no home directory/);
    await expect(resolveMode({ dataDir: board }, dir, unresolvable)).resolves.toMatchObject({
      singleRoots: { boardRoot: board },
    });
  });
});
