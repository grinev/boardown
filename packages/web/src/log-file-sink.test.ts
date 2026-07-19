import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogFileSink, logFileName, logFilesToPrune } from './log-file-sink.js';

const dirs: string[] = [];

const scratch = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'boardown-logs-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('logFileName', () => {
  it('produces a filename Windows accepts', () => {
    const name = logFileName(new Date('2026-07-19T14:32:08.123Z'));
    expect(name).toBe('web-2026-07-19T14-32-08-123Z.log');
    expect(name).not.toContain(':');
  });

  it('distinguishes two runs started in the same second', () => {
    const first = logFileName(new Date('2026-07-19T14:32:08.100Z'));
    const second = logFileName(new Date('2026-07-19T14:32:08.900Z'));
    expect(first).not.toBe(second);
  });
});

describe('logFilesToPrune', () => {
  const runs = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => logFileName(new Date(Date.UTC(2026, 0, i + 1))));

  it('keeps nothing to prune below the limit', () => {
    expect(logFilesToPrune(runs(10))).toEqual([]);
  });

  it('prunes the oldest beyond the limit', () => {
    const names = runs(13);
    const pruned = logFilesToPrune(names);
    expect(pruned).toHaveLength(3);
    // runs() is chronological, so the first three are the oldest.
    expect(pruned.sort()).toEqual(names.slice(0, 3).sort());
  });

  it('never touches a file it did not create', () => {
    const names = [...runs(13), 'notes.txt', 'debug.log', 'web-nonsense.log'];
    const pruned = logFilesToPrune(names);
    expect(pruned).not.toContain('notes.txt');
    expect(pruned).not.toContain('debug.log');
    expect(pruned).not.toContain('web-nonsense.log');
  });
});

describe('createLogFileSink', () => {
  it('creates the directory and writes one line per record', async () => {
    const dir = path.join(scratch(), 'logs');
    const opened = createLogFileSink(dir, new Date('2026-07-19T14:32:08.000Z'));
    expect(opened).not.toBeNull();
    expect(opened!.filePath).toContain('web-2026-07-19T14-32-08-000Z.log');

    opened!.sink({
      timestamp: '2026-07-19T14:32:09.000Z',
      level: 'warn',
      namespace: 'web.dev-fs',
      message: 'read nope.md: 404 not found',
    });

    // The stream opens and flushes asynchronously.
    await vi.waitFor(() => {
      expect(readFileSync(opened!.filePath, 'utf-8')).toBe(
        '2026-07-19T14:32:09.000Z WARN  web.dev-fs read nope.md: 404 not found\n',
      );
    });
    expect(readdirSync(dir)).toEqual(['web-2026-07-19T14-32-08-000Z.log']);
  });

  it('leaves exactly ten runs behind, including the new one', async () => {
    const dir = scratch();
    for (let i = 0; i < 12; i++) {
      writeFileSync(path.join(dir, logFileName(new Date(Date.UTC(2026, 0, i + 1)))), 'old\n');
    }
    writeFileSync(path.join(dir, 'keep-me.txt'), 'not mine\n');

    const opened = createLogFileSink(dir, new Date('2026-07-19T14:32:08.000Z'));
    // The stream creates the file asynchronously, so wait for it to land before
    // counting what the folder settled at.
    await vi.waitFor(() => expect(readdirSync(dir)).toContain(path.basename(opened!.filePath)));

    const remaining = readdirSync(dir).filter((n) => n.endsWith('.log'));
    expect(remaining).toHaveLength(10);
    expect(remaining).toContain('web-2026-07-19T14-32-08-000Z.log');
    expect(readdirSync(dir)).toContain('keep-me.txt');
  });

  it('reports failure instead of throwing when the directory is unusable', () => {
    const dir = scratch();
    const blocked = path.join(dir, 'logs');
    // A file where the directory should be: mkdir cannot succeed.
    writeFileSync(blocked, 'in the way\n');
    expect(createLogFileSink(blocked)).toBeNull();
    expect(readFileSync(blocked, 'utf-8')).toBe('in the way\n');
  });
});
