import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureLogging,
  createLogger,
  formatLogRecord,
  parseLogLevel,
  resetLogging,
  type LogRecord,
} from './logger.js';

// The sink lives in module state, so a leaked registration would make the next
// test order-dependent.
afterEach(() => {
  resetLogging();
});

const collect = (): LogRecord[] => {
  const records: LogRecord[] = [];
  configureLogging({ sink: (record) => records.push(record) });
  return records;
};

describe('logger', () => {
  it('is silent until a shell installs a sink', () => {
    const sink = vi.fn();
    createLogger('core.test').error('before any sink');
    configureLogging({ sink });
    createLogger('core.test').error('after the sink');
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('drops records below the configured level', () => {
    const records = collect();
    configureLogging({ level: 'error' });
    const log = createLogger('core.test');
    log.debug('quiet');
    log.info('quiet');
    log.warn('quiet');
    log.error('loud');
    expect(records.map((r) => r.message)).toEqual(['loud']);
  });

  it('keeps info and above at the default level', () => {
    const records = collect();
    const log = createLogger('core.test');
    log.debug('quiet');
    log.info('loud');
    expect(records.map((r) => r.message)).toEqual(['loud']);
  });

  it('carries an Error stack as a single-line detail', () => {
    const records = collect();
    createLogger('core.test').error('write failed', new Error('disk on fire'));
    expect(records).toHaveLength(1);
    expect(records[0]!.detail).toContain('disk on fire');
    expect(records[0]!.detail).not.toContain('\n');
  });

  it('describes a non-Error cause without throwing', () => {
    const records = collect();
    createLogger('core.test').error('odd', { toString: () => 'plain object' });
    expect(records[0]!.detail).toBe('plain object');
  });

  it('survives a cause whose serialization throws', () => {
    const records = collect();
    const hostile = {
      toString() {
        throw new Error('nope');
      },
    };
    expect(() => createLogger('core.test').error('hostile', hostile)).not.toThrow();
    expect(records[0]!.detail).toBe('[unserializable]');
  });

  it('truncates a runaway message instead of filling the file', () => {
    const records = collect();
    createLogger('core.test').error('x'.repeat(50_000));
    expect(records[0]!.message.length).toBeLessThan(5_000);
    expect(records[0]!.message).toContain('[truncated]');
  });

  it('does not let a throwing sink break the caller', () => {
    configureLogging({
      sink: () => {
        throw new Error('sink exploded');
      },
    });
    expect(() => createLogger('core.test').error('still fine')).not.toThrow();
  });

  it('formats a record as one greppable line', () => {
    const line = formatLogRecord({
      timestamp: '2026-07-19T10:00:00.000Z',
      level: 'warn',
      namespace: 'web.fs',
      message: 'not found: a.md',
    });
    expect(line).toBe('2026-07-19T10:00:00.000Z WARN  web.fs not found: a.md');
    expect(line).not.toContain('\n');
  });

  it('renders a cause on the same line as the message', () => {
    const line = formatLogRecord({
      timestamp: '2026-07-19T10:00:00.000Z',
      level: 'error',
      namespace: 'web.fs-adapter',
      message: 'write a.md failed',
      detail: 'Error: disk on fire | at write (a.ts:1:1)',
    });
    expect(line).toBe(
      '2026-07-19T10:00:00.000Z ERROR web.fs-adapter write a.md failed — Error: disk on fire | at write (a.ts:1:1)',
    );
    expect(line.split('\n')).toHaveLength(1);
  });

  it('parses a level from a shell-supplied value', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel(' warn ')).toBe('warn');
    expect(parseLogLevel('verbose')).toBeNull();
    expect(parseLogLevel(undefined)).toBeNull();
  });
});
