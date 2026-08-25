import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { watchBoard, type BoardWatcher } from './board-watcher';

let dir = '';
let watcher: BoardWatcher | null = null;
let seen: string[] = [];

// fs.watch is asynchronous and its latency is the platform's, not ours, so a
// test waits for the report it expects rather than for a fixed interval.
const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const sawSomethingIn = (folder: string): boolean =>
  seen.some((reported) => reported === folder || reported.startsWith(folder + path.sep));

const start = (): void => {
  watcher = watchBoard(dir, (absolutePath) => seen.push(absolutePath));
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-watcher-'));
  seen = [];
  await fs.mkdir(path.join(dir, 'releases'), { recursive: true });
  await fs.mkdir(path.join(dir, 'docs', 'guides', 'deep'), { recursive: true });
});

afterEach(async () => {
  watcher?.close();
  watcher = null;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('watchBoard', () => {
  it('reports a change to a file in the board root', async () => {
    start();
    await fs.writeFile(path.join(dir, 'config.yaml'), 'idPrefix: BD\n', 'utf-8');
    await waitFor(() => sawSomethingIn(dir));
    expect(sawSomethingIn(dir)).toBe(true);
  });

  it('reports a change one level down, in releases/', async () => {
    start();
    const releases = path.join(dir, 'releases');
    await fs.writeFile(path.join(releases, 'v1.md'), '# v1\n', 'utf-8');
    await waitFor(() => sawSomethingIn(releases));
    expect(sawSomethingIn(releases)).toBe(true);
  });

  it('reports a change deep inside docs/, which nests to any depth', async () => {
    start();
    const deep = path.join(dir, 'docs', 'guides', 'deep');
    await fs.writeFile(path.join(deep, 'note.md'), '# note\n', 'utf-8');
    await waitFor(() => sawSomethingIn(deep));
    expect(sawSomethingIn(deep)).toBe(true);
  });

  it('reports nothing while the board sits still', async () => {
    start();
    // Walking the tree to find the directories is itself a change to each one,
    // so a watcher built the wrong way round reports its own footsteps and the
    // board refreshes the instant it is opened.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(seen).toEqual([]);
  });

  it('reports nothing once it is closed', async () => {
    start();
    watcher?.close();
    watcher = null;
    await fs.writeFile(path.join(dir, 'config.yaml'), 'idPrefix: BD\n', 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(seen).toEqual([]);
  });

  it('starts on a board root that is not there', async () => {
    const missing = path.join(dir, 'nope');
    const absent = watchBoard(missing, (absolutePath) => seen.push(absolutePath));
    expect(() => absent.close()).not.toThrow();
    expect(seen).toEqual([]);
  });
});
