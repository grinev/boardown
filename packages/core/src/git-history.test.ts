import { describe, expect, it } from 'vitest';
import {
  GIT_HEAD_PROBE_ARGS,
  GIT_REPO_PROBE_ARGS,
  gitLogArgs,
  parseGitLog,
  readTaskCommits,
  subjectMentionsTask,
  type GitRun,
  type GitRunResult,
} from './git-history.js';

describe('subjectMentionsTask', () => {
  it('matches the ID as a token, whatever its case', () => {
    expect(subjectMentionsTask('feat(BD-36): commits panel', 'BD-36')).toBe(true);
    expect(subjectMentionsTask('fix bd-36 at last', 'BD-36')).toBe(true);
    expect(subjectMentionsTask('Bd-36', 'BD-36')).toBe(true);
    expect(subjectMentionsTask('done: BD-36.', 'BD-36')).toBe(true);
    expect(subjectMentionsTask('[BD-36] wip', 'bd-36')).toBe(true);
  });

  it('refuses a longer token that merely contains the ID', () => {
    expect(subjectMentionsTask('feat(BD-360): other', 'BD-36')).toBe(false);
    expect(subjectMentionsTask('see XBD-36 instead', 'BD-36')).toBe(false);
    expect(subjectMentionsTask('BD-36a', 'BD-36')).toBe(false);
  });

  it('finds a later occurrence when the first one is inside a longer token', () => {
    expect(subjectMentionsTask('BD-360 and BD-36', 'BD-36')).toBe(true);
  });

  it('matches a merge subject like any other', () => {
    expect(subjectMentionsTask("Merge branch 'BD-36' into main", 'BD-36')).toBe(true);
  });

  it('never matches an empty ID', () => {
    expect(subjectMentionsTask('anything', '')).toBe(false);
  });
});

describe('parseGitLog', () => {
  it('reads one commit per line, splitting the hash and the date off the subject', () => {
    const out = 'abc1234 2026-09-02T09:11:49+03:00 feat(BD-36): show related commits\n';
    expect(parseGitLog(out, 'BD-36')).toEqual([
      {
        hash: 'abc1234',
        date: '2026-09-02T09:11:49+03:00',
        subject: 'feat(BD-36): show related commits',
      },
    ]);
  });

  it('keeps git order and drops the prefilter over-matches', () => {
    const out = [
      'aaaaaaa 2026-09-02T09:00:00+03:00 BD-36 newest',
      'bbbbbbb 2026-09-01T09:00:00+03:00 BD-360 not ours',
      'ccccccc 2026-08-30T09:00:00+03:00 old BD-36',
    ].join('\n');
    expect(parseGitLog(out, 'BD-36').map((c) => c.hash)).toEqual(['aaaaaaa', 'ccccccc']);
  });

  it('trims a carriage return and ignores blank or malformed lines', () => {
    const out = [
      'abc1234 2026-09-02T09:11:49+03:00 chore: BD-36 tidy\r',
      '',
      'nohashline',
      'def5678 BD-36-without-a-date',
      'ef01234 2026-09-01T10:00:00+03:00 ',
    ].join('\n');
    expect(parseGitLog(out, 'BD-36')).toEqual([
      {
        hash: 'abc1234',
        date: '2026-09-02T09:11:49+03:00',
        subject: 'chore: BD-36 tidy',
      },
    ]);
  });

  it('is empty for empty output', () => {
    expect(parseGitLog('', 'BD-36')).toEqual([]);
  });
});

describe('gitLogArgs', () => {
  it('narrows with a case-insensitive fixed string and filters no merges out', () => {
    const args = gitLogArgs('BD-36');
    expect(args).toContain('--fixed-strings');
    expect(args).toContain('--regexp-ignore-case');
    expect(args).toContain('--grep=BD-36');
    expect(args).toContain('--format=%h %aI %s');
    expect(args).not.toContain('--no-merges');
    expect(args).not.toContain('--first-parent');
  });
});

const NO_REPO_STDERR = 'fatal: not a git repository (or any of the parent directories): .git\n';

const runner = (answers: readonly GitRunResult[]): { run: GitRun; calls: string[][] } => {
  const calls: string[][] = [];
  let next = 0;
  const run: GitRun = (args) => {
    calls.push([...args]);
    const answer = answers[next];
    next += 1;
    return Promise.resolve(answer ?? { kind: 'unavailable' });
  };
  return { run, calls };
};

describe('readTaskCommits', () => {
  it('reads the log once when git succeeds', async () => {
    const { run, calls } = runner([
      {
        kind: 'exited',
        code: 0,
        stdout: 'abc1234 2026-09-02T09:11:49+03:00 feat(BD-36): panel\n',
        stderr: '',
      },
    ]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'ready',
      commits: [
        {
          hash: 'abc1234',
          date: '2026-09-02T09:11:49+03:00',
          subject: 'feat(BD-36): panel',
        },
      ],
    });
    expect(calls).toHaveLength(1);
  });

  it('reports git as unavailable when it cannot be run', async () => {
    const { run, calls } = runner([{ kind: 'unavailable' }]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'git-unavailable',
      commits: [],
    });
    expect(calls).toHaveLength(1);
  });

  it('reports no repository when git says there is none', async () => {
    const { run, calls } = runner([
      { kind: 'exited', code: 128, stdout: '', stderr: NO_REPO_STDERR },
      { kind: 'exited', code: 128, stdout: '', stderr: NO_REPO_STDERR },
    ]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'not-a-repository',
      commits: [],
    });
    expect(calls[1]).toEqual([...GIT_REPO_PROBE_ARGS]);
  });

  it('reports a repository git refuses to open as unavailable, not as missing', async () => {
    // Dubious ownership, an unreadable .git: git exits 128 exactly as it does
    // outside a repository, and only the message tells the two apart.
    const { run } = runner([
      { kind: 'exited', code: 128, stdout: '', stderr: '' },
      {
        kind: 'exited',
        code: 128,
        stdout: '',
        stderr: "fatal: detected dubious ownership in repository at '/srv/app'\n",
      },
    ]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'git-unavailable',
      commits: [],
    });
  });

  it('reads an empty repository as ready with nothing in it', async () => {
    const { run, calls } = runner([
      { kind: 'exited', code: 128, stdout: '', stderr: '' },
      { kind: 'exited', code: 0, stdout: '.git\n', stderr: '' },
      { kind: 'exited', code: 1, stdout: '', stderr: '' },
    ]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'ready',
      commits: [],
    });
    expect(calls[2]).toEqual([...GIT_HEAD_PROBE_ARGS]);
  });

  it('reports an unexplained failure inside a real repository as unavailable', async () => {
    const { run } = runner([
      { kind: 'exited', code: 129, stdout: '', stderr: '' },
      { kind: 'exited', code: 0, stdout: '.git\n', stderr: '' },
      { kind: 'exited', code: 0, stdout: 'deadbee\n', stderr: '' },
    ]);
    await expect(readTaskCommits('BD-36', run)).resolves.toEqual({
      state: 'git-unavailable',
      commits: [],
    });
  });
});
