import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitRunIn } from './git-history';

// The host's half decides nothing — it reports what git did. These cover the two
// answers core's decision chain reads: an exit code, or "we learned nothing".
describe('gitRunIn', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bd-git-run-'));
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('reports a zero exit with git output', async () => {
    const result = await gitRunIn(dir)(['--version']);
    expect(result.kind).toBe('exited');
    if (result.kind !== 'exited') return;
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('git version');
  });

  it('reports git own non-zero exit with the message, rather than a failure', async () => {
    const result = await gitRunIn(dir)(['rev-parse', '--git-dir']);
    expect(result).toMatchObject({ kind: 'exited', code: 128 });
    if (result.kind !== 'exited') return;
    // Pinned to C, so this is git's own wording whatever the user's locale — it
    // is what core reads to tell a missing repository from a refused one.
    expect(result.stderr).toContain('not a git repository');
  });

  it('reports a command git does not have as an exit code, not as unavailable', async () => {
    const result = await gitRunIn(dir)(['no-such-subcommand']);
    expect(result.kind).toBe('exited');
  });
});
