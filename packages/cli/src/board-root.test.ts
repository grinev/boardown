import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findBoardRoot } from './board-root';

describe('findBoardRoot', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bd-cli-root-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds .boardown walking up from a nested directory', async () => {
    await mkdir(join(root, '.boardown'), { recursive: true });
    const nested = join(root, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    expect(await findBoardRoot(nested)).toBe(join(root, '.boardown'));
  });

  it('returns null when no board exists upward', async () => {
    const nested = join(root, 'x');
    await mkdir(nested, { recursive: true });
    expect(await findBoardRoot(nested)).toBeNull();
  });

  it('uses an explicit dataDir when it exists', async () => {
    const dataDir = join(root, '.boardown');
    await mkdir(dataDir, { recursive: true });
    expect(await findBoardRoot(root, dataDir)).toBe(dataDir);
  });

  it('returns null when an explicit dataDir is missing', async () => {
    expect(await findBoardRoot(root, join(root, 'nope'))).toBeNull();
  });
});
