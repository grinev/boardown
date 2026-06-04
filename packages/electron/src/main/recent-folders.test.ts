import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// recent-folders stores its JSON under app.getPath('userData'); there is no
// Electron runtime in a unit test, so point that at a temp dir per test.
const { state } = vi.hoisted(() => ({ state: { userData: '' } }));
vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
}));

import { addRecent, isKnownRecent, listRecents, removeRecent } from './recent-folders';

let created: string[] = [];

const makeProject = async (label: string, withBoard = false): Promise<string> => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `boardown-proj-${label}-`));
  created.push(dir);
  if (withBoard) {
    await fsp.mkdir(path.join(dir, '.boardown'), { recursive: true });
    await fsp.writeFile(path.join(dir, '.boardown', 'config.yaml'), 'idPrefix: AA\nnextId: 1\n');
  }
  return dir;
};

describe('recent-folders', () => {
  beforeEach(async () => {
    state.userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'boardown-recents-'));
    created = [];
  });

  afterEach(async () => {
    for (const dir of [...created, state.userData]) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('adds entries most-recent-first', async () => {
    const a = await makeProject('a');
    const b = await makeProject('b');
    await addRecent(a);
    await addRecent(b);
    expect((await listRecents()).map((e) => e.folder)).toEqual([b, a]);
  });

  it('dedups by folder and bumps the repeat to the top', async () => {
    const a = await makeProject('a');
    const b = await makeProject('b');
    await addRecent(a);
    await addRecent(b);
    await addRecent(a);
    const list = await listRecents();
    expect(list.map((e) => e.folder)).toEqual([a, b]);
  });

  it('caps the list at ten entries', async () => {
    for (let i = 0; i < 12; i += 1) {
      await addRecent(await makeProject(`p${i}`));
    }
    expect((await listRecents()).length).toBe(10);
  });

  it('removeRecent drops one entry, keeps the rest', async () => {
    const a = await makeProject('a');
    const b = await makeProject('b');
    await addRecent(a);
    await addRecent(b);
    await removeRecent(a);
    expect((await listRecents()).map((e) => e.folder)).toEqual([b]);
  });

  it('isKnownRecent checks membership without pruning', async () => {
    const a = await makeProject('a');
    await addRecent(a);
    expect(await isKnownRecent(a)).toBe(true);
    expect(await isKnownRecent('/definitely/not/here')).toBe(false);
  });

  it('listRecents prunes folders that no longer exist', async () => {
    const a = await makeProject('a');
    const b = await makeProject('b');
    await addRecent(a);
    await addRecent(b);
    await fsp.rm(b, { recursive: true, force: true });
    expect((await listRecents()).map((e) => e.folder)).toEqual([a]);
  });

  it('flags hasBoard from the presence of .boardown/config.yaml', async () => {
    const withBoard = await makeProject('wb', true);
    const without = await makeProject('wo', false);
    await addRecent(withBoard);
    await addRecent(without);
    const list = await listRecents();
    expect(list.find((e) => e.folder === withBoard)?.hasBoard).toBe(true);
    expect(list.find((e) => e.folder === without)?.hasBoard).toBe(false);
  });
});
