import { execFile } from 'node:child_process';
import type { ServerResponse } from 'node:http';
// By relative path into core's sources, not by package name: this module is
// pulled in when Vite loads its own config, where a workspace package resolves
// to its unbuilt `.ts` entry and Node cannot import it. Same as board-api.ts.
import { createLogger } from '../../../core/src/logger';
import {
  readTaskCommits,
  type GitRun,
  type GitRunResult,
} from '../../../core/src/git-history';
import { sendJson } from './board-api.js';

const log = createLogger('web.git-history');

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

// Given a project root per request by whichever host is running, the same way
// handleProjectFile is. Read-only: no board root ever reaches it.
export const handleGitCommits = async (
  res: ServerResponse,
  params: URLSearchParams,
  projectRoot: string,
): Promise<void> => {
  const taskId = params.get('task') ?? '';
  const result = await readTaskCommits(taskId, gitRunIn(projectRoot));
  log.debug(`git commits ${taskId}: ${result.state}, ${String(result.commits.length)}`);
  sendJson(res, 200, result);
};
