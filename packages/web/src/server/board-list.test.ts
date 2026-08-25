import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeEntry } from './board-list';
import { rootsFromProjectFolder } from './roots';

const made: string[] = [];

const tempProject = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-list-'));
  made.push(dir);
  return dir;
};

const entryFor = (folder: string) => ({ id: 'shop', ...rootsFromProjectFolder(folder) });

const writeConfig = async (folder: string, text: string): Promise<void> => {
  const boardRoot = rootsFromProjectFolder(folder).boardRoot;
  await fs.mkdir(boardRoot, { recursive: true });
  await fs.writeFile(path.join(boardRoot, 'config.yaml'), text, 'utf-8');
};

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('describeEntry', () => {
  it('takes the name from the board config', async () => {
    const folder = await tempProject();
    await writeConfig(folder, 'idPrefix: SH\nnextId: 1\nprojectName: Shop\n');
    expect(await describeEntry(entryFor(folder))).toMatchObject({
      id: 'shop',
      name: 'Shop',
      reason: null,
    });
  });

  it('reports a folder that is not there', async () => {
    const folder = await tempProject();
    const missing = path.join(folder, 'nowhere');
    expect(await describeEntry(entryFor(missing))).toMatchObject({
      name: null,
      reason: 'folder not found',
    });
  });

  it('reports a folder that is a file', async () => {
    const folder = await tempProject();
    const file = path.join(folder, 'a-file');
    await fs.writeFile(file, 'x', 'utf-8');
    expect(await describeEntry(entryFor(file))).toMatchObject({
      name: null,
      reason: 'could not be read',
    });
  });

  it('reports a folder with no board', async () => {
    const folder = await tempProject();
    expect(await describeEntry(entryFor(folder))).toMatchObject({
      name: null,
      reason: 'no board yet',
    });
  });

  it('reports a board whose config does not validate', async () => {
    const folder = await tempProject();
    await writeConfig(folder, 'idPrefix: 12\n');
    expect(await describeEntry(entryFor(folder))).toMatchObject({
      name: null,
      reason: 'config.yaml is invalid',
    });
  });
});
