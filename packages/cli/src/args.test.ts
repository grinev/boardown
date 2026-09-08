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

  it('keeps a missing value on a repeated flag as an empty string, not "true"', () => {
    const { flags } = parseArgs(['x', '--checklist', 'first', '--checklist']);
    expect(flagList(flags, 'checklist')).toEqual(['first', '']);
    const leading = parseArgs(['x', '--checklist', '--checklist', 'second']);
    expect(flagList(leading.flags, 'checklist')).toEqual(['', 'second']);
  });

  it('keeps a repeated boolean flag a plain true, not an array', () => {
    const { flags } = parseArgs(['backlog', '--full', '--full', '--json', '--json']);
    expect(flags.full).toBe(true);
    expect(flags.json).toBe(true);
    expect(flagBool(flags, 'full')).toBe(true);
  });

  it('swallows consecutive values only for opted-in flags', () => {
    const multi = new Set(['type']);
    const { flags, positionals } = parseArgs(
      ['task', 'list', '--type', 'bug', 'docs', '--status', 'todo', 'done'],
      { multiValueFlags: multi },
    );
    expect(flagList(flags, 'type')).toEqual(['bug', 'docs']);
    expect(flags.status).toBe('todo');
    expect(positionals).toEqual(['task', 'list', 'done']);
  });

  it('leaves the next token positional when the flag is not opted in', () => {
    const { flags, positionals } = parseArgs(['task', 'add', '--type', 'bug', 'Title']);
    expect(flags.type).toBe('bug');
    expect(positionals).toEqual(['task', 'add', 'Title']);
  });

  it('swallows after an attached --flag=value too', () => {
    const { flags, positionals } = parseArgs(
      ['task', 'list', '--type=bug', 'docs'],
      { multiValueFlags: new Set(['type']) },
    );
    expect(flagList(flags, 'type')).toEqual(['bug', 'docs']);
    expect(positionals).toEqual(['task', 'list']);
  });

  it('stops swallowing at the next flag', () => {
    const { flags } = parseArgs(
      ['task', 'list', '--type', 'bug', 'docs', '--priority', 'high'],
      { multiValueFlags: new Set(['type', 'priority']) },
    );
    expect(flagList(flags, 'type')).toEqual(['bug', 'docs']);
    expect(flags.priority).toBe('high');
  });
});
