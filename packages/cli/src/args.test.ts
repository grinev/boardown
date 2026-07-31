import { describe, expect, it } from 'vitest';
import { flagBool, flagList, flagString, parseArgs } from './args';

describe('parseArgs', () => {
  it('collects positionals in order', () => {
    expect(parseArgs(['task', 'add', 'My task']).positionals).toEqual(['task', 'add', 'My task']);
  });

  it('parses `--flag value`', () => {
    expect(parseArgs(['task', 'add', 'T', '--type', 'feature']).flags.type).toBe('feature');
  });

  it('parses --priority as a value flag, not a boolean', () => {
    const { positionals, flags } = parseArgs(['task', 'add', 'T', '--priority', 'critical']);
    expect(flags.priority).toBe('critical');
    expect(positionals).toEqual(['task', 'add', 'T']);
  });

  it('parses `--flag=value`', () => {
    expect(parseArgs(['--data-dir=/x']).flags['data-dir']).toBe('/x');
  });

  it('treats known boolean flags as boolean', () => {
    const { positionals, flags } = parseArgs(['board', '--json']);
    expect(flags.json).toBe(true);
    expect(positionals).toEqual(['board']);
  });

  it('does not let a boolean flag swallow the next token', () => {
    expect(parseArgs(['--json', 'board']).positionals).toEqual(['board']);
  });

  it('treats --up / --down / --no-release as boolean even before a positional', () => {
    const up = parseArgs(['task', 'reorder', '--up', 'BD-1']);
    expect(up.flags.up).toBe(true);
    expect(up.positionals).toEqual(['task', 'reorder', 'BD-1']);
    expect(parseArgs(['task', 'edit', '--no-release', 'BD-1']).positionals).toContain('BD-1');
  });

  it('lets a value flag consume the next token but keeps later positionals', () => {
    const { positionals, flags } = parseArgs(['task', 'move', 'BD-1', '--release', 'v1', '--json']);
    expect(flags.release).toBe('v1');
    expect(flags.json).toBe(true);
    expect(positionals).toEqual(['task', 'move', 'BD-1']);
  });

  it('flagString / flagBool read flags by name', () => {
    const { flags } = parseArgs(['x', '--type', 'bug', '--json']);
    expect(flagString(flags, 'type')).toBe('bug');
    expect(flagString(flags, 'missing')).toBeUndefined();
    expect(flagBool(flags, 'json')).toBe(true);
    expect(flagBool(flags, 'type')).toBe(false);
  });

  it('accumulates a repeated flag and reads it as a list', () => {
    const { flags } = parseArgs([
      'task', 'edit', 'BD-1',
      '--field', 'a=1',
      '--field=b=2',
      '--field', 'c=3',
    ]);
    expect(flagList(flags, 'field')).toEqual(['a=1', 'b=2', 'c=3']);
  });

  it('reads a single occurrence as a one-item list, and a missing one as empty', () => {
    const { flags } = parseArgs(['x', '--field', 'a=1']);
    expect(flagList(flags, 'field')).toEqual(['a=1']);
    expect(flagList(flags, 'missing')).toEqual([]);
  });

  it('gives a repeated single-value flag its last value', () => {
    const { flags } = parseArgs(['x', '--type', 'bug', '--type', 'tech']);
    expect(flagString(flags, 'type')).toBe('tech');
  });

  it('keeps a repeated boolean flag a plain true, not an array', () => {
    const { flags } = parseArgs(['backlog', '--full', '--full', '--json', '--json']);
    expect(flags.full).toBe(true);
    expect(flags.json).toBe(true);
    expect(flagBool(flags, 'full')).toBe(true);
  });
});
