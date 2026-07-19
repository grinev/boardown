import type { FileStat, FsAdapter, FsEntry, LogRecord } from '@boardown/core';
import { configureLogging, resetLogging } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './store';

// Every failure in the store surfaces by setting errorMessage, and the store
// logs that transition from inside its own `set`. Driving a real action is the
// only faithful way to assert it: useBoardStore.setState is the raw store API
// and deliberately bypasses the wrapper, as no production code uses it.
class ExplodingFs implements FsAdapter {
  async read(path: string): Promise<string> {
    throw new Error(`boom while reading ${path}`);
  }
  async write(): Promise<void> {
    throw new Error('boom while writing');
  }
  async list(): Promise<FsEntry[]> {
    throw new Error('boom while listing');
  }
  async mkdir(): Promise<void> {
    throw new Error('boom while mkdir');
  }
  async remove(): Promise<void> {
    throw new Error('boom while removing');
  }
  async stat(): Promise<FileStat | null> {
    throw new Error('boom while stat-ing');
  }
}

const records: LogRecord[] = [];

beforeEach(() => {
  records.length = 0;
  configureLogging({ sink: (record) => records.push(record) });
});

afterEach(() => {
  resetLogging();
});

describe('store error logging', () => {
  it('logs the failure of a real store action', async () => {
    await useBoardStore.getState().load(new ExplodingFs());

    expect(useBoardStore.getState().errorMessage).not.toBeNull();
    const errors = records.filter((r) => r.level === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.namespace).toBe('ui.store');
    expect(errors[0]!.message).toBe(useBoardStore.getState().errorMessage);
  });

  it('logs a successful action at info, with its arguments, and no error', () => {
    useBoardStore.getState().setActiveTab('backlog');
    expect(records).toHaveLength(1);
    expect(records[0]!.level).toBe('info');
    expect(records[0]!.message).toBe('setActiveTab("backlog")');
    expect(records.filter((r) => r.level === 'error')).toHaveLength(0);
  });

  it('logs the action before the error it causes', async () => {
    await useBoardStore.getState().load(new ExplodingFs());
    expect(records[0]!.level).toBe('info');
    expect(records[0]!.message).toContain('load(');
    expect(records.some((r) => r.level === 'error')).toBe(true);
  });

  it('writes nothing at all when no shell installed a sink', async () => {
    resetLogging();
    await useBoardStore.getState().load(new ExplodingFs());
    expect(records).toHaveLength(0);
  });
});
