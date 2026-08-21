import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EPIC_NAME_MAX_LENGTH } from '@boardown/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../package.json';
import { run } from './app';

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

// Drive run() end to end while capturing what it writes and forcing the TTY
// mode it branches on (json when stdout is not a TTY). stdout/stderr/isTTY are
// swapped for the call and always restored, so nothing leaks into the reporter.
async function capture(
  argv: string[],
  opts: { cwd?: string; tty?: boolean } = {},
): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const origTTY = process.stdout.isTTY;
  process.stdout.isTTY = opts.tty ?? false;
  try {
    const code = await run(argv, opts.cwd !== undefined ? { cwd: opts.cwd } : {});
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    process.stdout.isTTY = origTTY;
  }
}

const parse = (s: string): Record<string, unknown> => JSON.parse(s.trim()) as Record<string, unknown>;

const errorCode = (env: Record<string, unknown>): string => (env.error as { code: string }).code;

describe('run() — routing, envelopes, exit codes', () => {
  it('no command prints a JSON help envelope when piped', async () => {
    const { code, stdout } = await capture([]);
    expect(code).toBe(0);
    const env = parse(stdout);
    expect(env).toMatchObject({ ok: true });
    expect(env).not.toHaveProperty('command');
    expect((env.data as { commands: string[] }).commands).toContain('backlog');
  });

  it('--help and `help` print the human help under a TTY', async () => {
    const viaFlag = await capture(['--help'], { tty: true });
    expect(viaFlag.code).toBe(0);
    expect(viaFlag.stdout).toContain('boardown — markdown task board CLI');

    const viaCmd = await capture(['help'], { tty: true });
    expect(viaCmd.stdout).toContain('Usage: boardown <command>');
  });

  it('--version, -v and `version` print the package version', async () => {
    const { version } = pkg;

    const human = await capture(['--version'], { tty: true });
    expect(human.code).toBe(0);
    expect(human.stdout.trim()).toBe(`boardown ${version}`);

    // `--version schema` must not swallow the next token: without `version` in
    // BOOLEAN_FLAGS it parses as a string and falls through to the help output.
    for (const argv of [['--version'], ['-v'], ['version'], ['--version', 'schema']]) {
      const { code, stdout } = await capture(argv);
      expect(code).toBe(0);
      expect(parse(stdout)).toEqual({ ok: true, data: { version } });
    }
  });

  it('schema prints an ok envelope with the machine-readable contract', async () => {
    const { code, stdout } = await capture(['schema']);
    expect(code).toBe(0);
    const env = parse(stdout);
    expect(env).toMatchObject({ ok: true });
    expect((env.data as { version: number }).version).toBe(10);
    // The epic name rule is enforced whatever the board, so an agent must be
    // able to read it without first failing a write.
    expect(env.data).toMatchObject({ epicNameMaxLength: EPIC_NAME_MAX_LENGTH });
  });

  it('unknown command: JSON error envelope on stdout, exit 2', async () => {
    const { code, stdout, stderr } = await capture(['frobnicate']);
    expect(code).toBe(2);
    expect(stderr).toBe('');
    const env = parse(stdout);
    expect(env).toMatchObject({ ok: false });
    expect(env).not.toHaveProperty('command');
    expect(errorCode(env)).toBe('UNKNOWN_COMMAND');
  });

  // `board` is gone, replaced by the three view commands; it must not linger as
  // a silent alias.
  it('the removed board command is an unknown command, exit 2', async () => {
    const { code, stdout } = await capture(['board']);
    expect(code).toBe(2);
    expect(errorCode(parse(stdout))).toBe('UNKNOWN_COMMAND');
  });

  it('unknown command under a TTY: human error on stderr, nothing on stdout', async () => {
    const { code, stdout, stderr } = await capture(['frobnicate'], { tty: true });
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('error:');
    expect(stderr).toContain('Unknown command');
  });

  it('a subcommand usage error maps to exit 2 with a USAGE envelope', async () => {
    const missingSub = await capture(['task']);
    expect(missingSub.code).toBe(2);
    const env = parse(missingSub.stdout);
    expect(env).toMatchObject({ ok: false });
    expect(errorCode(env)).toBe('USAGE');

    const badSub = await capture(['task', 'bogus']);
    expect(badSub.code).toBe(2);
    expect(errorCode(parse(badSub.stdout))).toBe('USAGE');
  });

  it('an operation failure (no board) maps to exit 1 with a NO_BOARD envelope', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'bd-cli-run-nb-'));
    try {
      const { code, stdout } = await capture(['backlog'], { cwd: empty });
      expect(code).toBe(1);
      const env = parse(stdout);
      expect(env.ok).toBe(false);
      expect(errorCode(env)).toBe('NO_BOARD');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  describe('with an initialized board', () => {
    let project: string;

    beforeEach(async () => {
      project = await mkdtemp(join(tmpdir(), 'bd-cli-run-'));
      const { code } = await capture(['init', '--id-prefix', 'TS', '--project-name', 'Demo'], {
        cwd: project,
      });
      expect(code).toBe(0);
    });

    afterEach(async () => {
      await rm(project, { recursive: true, force: true });
    });

    it('a successful command is a JSON ok envelope when piped, exit 0', async () => {
      const { code, stdout } = await capture(['backlog'], { cwd: project });
      expect(code).toBe(0);
      const env = parse(stdout);
      expect(env).toMatchObject({ ok: true });
      expect(env).not.toHaveProperty('command');
      expect(env.data).toBeTypeOf('object');
    });

    it('under a TTY the same command prints human text, not JSON', async () => {
      const { stdout } = await capture(['backlog'], { cwd: project, tty: true });
      expect(stdout).toContain('Demo — backlog');
      expect(() => {
        JSON.parse(stdout.trim());
      }).toThrow();
    });

    it('--json forces the JSON envelope even under a TTY', async () => {
      const { stdout } = await capture(['backlog', '--json'], { cwd: project, tty: true });
      expect(parse(stdout)).toMatchObject({ ok: true });
    });
  });
});
