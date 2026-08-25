import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RegistryFile, parseRegistry } from './registry';
import { BOARD_DIR_NAME } from './roots';

const made: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-registry-'));
  made.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const ABS = path.resolve('/projects/shop');

describe('parseRegistry', () => {
  it('maps each id to a project folder and the board inside it', () => {
    const result = parseRegistry(`projects:\n  shop: ${ABS}\n`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        id: 'shop',
        projectRoot: ABS,
        boardRoot: path.join(ABS, BOARD_DIR_NAME),
      });
    }
  });

  it('accepts an empty mapping', () => {
    const result = parseRegistry('projects: {}\n');
    expect(result).toMatchObject({ ok: true, entries: [] });
  });

  it('refuses malformed YAML', () => {
    const result = parseRegistry('projects:\n  - [unclosed\n');
    expect(result.ok).toBe(false);
  });

  it('refuses a duplicated id', () => {
    const result = parseRegistry(`projects:\n  shop: ${ABS}\n  shop: ${ABS}\n`);
    expect(result.ok).toBe(false);
  });

  it('refuses a missing projects key', () => {
    expect(parseRegistry('boards:\n  shop: /projects/shop\n').ok).toBe(false);
    expect(parseRegistry('').ok).toBe(false);
  });

  it('refuses an id that is not a URL segment', () => {
    const result = parseRegistry(`projects:\n  "My Shop": ${ABS}\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('lowercase');
    }
  });

  it('refuses a relative path', () => {
    const result = parseRegistry('projects:\n  shop: ./shop\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('absolute');
    }
  });
});

describe('RegistryFile', () => {
  it('re-parses only when the file changed', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n`, 'utf-8');
    const registry = new RegistryFile(file);

    expect((await registry.read()).entries).toHaveLength(1);
    expect(registry.loaded).toBe(true);
    expect((await registry.read()).entries).toHaveLength(1);

    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n  other: ${ABS}\n`, 'utf-8');
    await fs.utimes(file, new Date(), new Date(Date.now() + 1000));
    expect((await registry.read()).entries).toHaveLength(2);
  });

  it('drops an entry that left the file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n  other: ${ABS}\n`, 'utf-8');
    const registry = new RegistryFile(file);
    expect((await registry.read()).entries).toHaveLength(2);

    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n`, 'utf-8');
    await fs.utimes(file, new Date(), new Date(Date.now() + 1000));
    const state = await registry.read();
    expect(state.entries.map((entry) => entry.id)).toEqual(['shop']);
    expect(state.staleReason).toBeNull();
  });

  it('keeps the last good mapping when a re-read fails, and reports why', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n`, 'utf-8');
    const registry = new RegistryFile(file);
    expect((await registry.read()).entries).toHaveLength(1);

    await fs.writeFile(file, 'projects:\n  - [unclosed\n', 'utf-8');
    await fs.utimes(file, new Date(), new Date(Date.now() + 1000));
    const state = await registry.read();
    expect(state.entries.map((entry) => entry.id)).toEqual(['shop']);
    expect(state.staleReason).not.toBeNull();
  });

  it('reports a file that never loaded', async () => {
    const dir = await tempDir();
    const registry = new RegistryFile(path.join(dir, 'missing.yaml'));
    const state = await registry.read();
    expect(registry.loaded).toBe(false);
    expect(state.entries).toEqual([]);
    expect(state.staleReason).not.toBeNull();
  });
});

describe('RegistryFile with absentIsEmpty', () => {
  it('reads a file that is not there as a registry with no projects', async () => {
    const dir = await tempDir();
    const registry = new RegistryFile(path.join(dir, 'missing.yaml'), { absentIsEmpty: true });
    expect(await registry.read()).toEqual({ entries: [], staleReason: null });
    expect(registry.loaded).toBe(true);
  });

  it('picks up a file written after it was found missing', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    const registry = new RegistryFile(file, { absentIsEmpty: true });
    expect((await registry.read()).entries).toEqual([]);

    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n`, 'utf-8');
    expect((await registry.read()).entries.map((entry) => entry.id)).toEqual(['shop']);
  });

  it('forgets the projects of a file that was deleted', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, `projects:\n  shop: ${ABS}\n`, 'utf-8');
    const registry = new RegistryFile(file, { absentIsEmpty: true });
    expect((await registry.read()).entries).toHaveLength(1);

    await fs.rm(file);
    expect(await registry.read()).toEqual({ entries: [], staleReason: null });
  });

  it('still refuses a file that is there and does not parse', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'projects.yaml');
    await fs.writeFile(file, 'projects:\n  - [unclosed\n', 'utf-8');
    const registry = new RegistryFile(file, { absentIsEmpty: true });
    const state = await registry.read();
    expect(registry.loaded).toBe(false);
    expect(state.staleReason).not.toBeNull();
  });

  it('still refuses a path that is a folder rather than a file', async () => {
    const dir = await tempDir();
    const asFolder = path.join(dir, 'projects.yaml');
    await fs.mkdir(asFolder);
    const registry = new RegistryFile(asFolder, { absentIsEmpty: true });
    expect((await registry.read()).staleReason).not.toBeNull();
    expect(registry.loaded).toBe(false);
  });
});
