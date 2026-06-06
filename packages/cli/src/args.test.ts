import { describe, expect, it } from 'vitest';
import { flagBool, flagString, parseArgs } from './args';

describe('parseArgs', () => {
  it('collects positionals in order', () => {
    expect(parseArgs(['task', 'add', 'My task']).positionals).toEqual(['task', 'add', 'My task']);
  });

  it('parses `--flag value`', () => {
    expect(parseArgs(['task', 'add', 'T', '--type', 'feature']).flags.type).toBe('feature');
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
});
