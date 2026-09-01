import { execFile } from 'node:child_process';
import type { GitRun, GitRunResult } from '@boardown/core';

// A lock wait or a repository on a slow mount must not leave a panel at
// `Loading…` forever: past this the child is killed and the read answers
// unavailable, like a git that could not be spawned at all.
const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 8 * 1024 * 1024;

// The host's whole share of the feature: run git and report what happened. Every
// decision about what the answer means lives in `readTaskCommits` in core.
export const gitRunIn =
  (cwd: string): GitRun =>
  (args) =>
    new Promise<GitRunResult>((resolve) => {
      execFile(
        'git',
        [...args],
        {
          cwd,
          // Pinned so core reads git's own words rather than a translation of
          // them; nothing else about the environment is changed.
          env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
          encoding: 'utf8',
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
        },
        (err, stdout, stderr) => {
          if (err === null) {
            resolve({ kind: 'exited', code: 0, stdout, stderr });
            return;
          }
          // A numeric code is git's own exit status; anything else (ENOENT, a
          // kill on timeout, an output overflow) means we learned nothing.
          const code: unknown = (err as { code?: unknown }).code;
          resolve(
            typeof code === 'number'
              ? { kind: 'exited', code, stdout, stderr }
              : { kind: 'unavailable' },
          );
        },
      );
    });
