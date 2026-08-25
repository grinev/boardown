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

describe('resolveMode', () => {
  it('treats the current directory as a project folder', async () => {
    const dir = await tempDir();
    const resolved = await resolveMode({}, dir);
    expect(resolved.singleRoots).toEqual({
      projectRoot: dir,
      boardRoot: path.join(dir, BOARD_DIR_NAME),
    });
  });

  it('treats --data-dir as the board folder itself', async () => {
    const dir = await tempDir();
    const board = path.join(dir, BOARD_DIR_NAME);
    const resolved = await resolveMode({ dataDir: board }, dir);
    expect(resolved.singleRoots).toEqual({ projectRoot: dir, boardRoot: board });
  });

  it('resolves a relative --data-dir against the working directory', async () => {
    const dir = await tempDir();
    const resolved = await resolveMode({ dataDir: BOARD_DIR_NAME }, dir);
    expect(resolved.singleRoots?.boardRoot).toBe(path.join(dir, BOARD_DIR_NAME));
  });

  it('treats a registry entry as a project folder', async () => {
    const dir = await tempDir();
    const project = path.join(dir, 'shop');
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, `projects:\n  shop: ${project.replace(/\\/g, '/')}\n`, 'utf-8');
    const resolved = await resolveMode({ registry: file }, dir);
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
    await expect(resolveMode({ registry: missing }, dir)).rejects.toThrow(missing);
  });

  it('refuses a registry that does not validate', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, 'projects:\n  "My Shop": /somewhere\n', 'utf-8');
    await expect(resolveMode({ registry: file }, dir)).rejects.toThrow(/lowercase/);
  });
});
