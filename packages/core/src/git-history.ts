import { createLogger } from './logger.js';

const log = createLogger('core.git-history');

export interface GitCommit {
  // Git's own unique abbreviation, seven characters or more.
  hash: string;
  // The complete first line of the commit message.
  subject: string;
}

export type GitHistoryState =
  | 'ready'
  // The project folder is not inside a Git repository.
  | 'not-a-repository'
  // `git` could not be run at all, or ran and told us nothing we can classify.
  | 'git-unavailable';

export interface GitHistoryResult {
  state: GitHistoryState;
  commits: GitCommit[];
}

// What a host hands back after running git for us. A non-zero exit is an answer,
// not a failure — the whole decision below is made out of exit codes.
export type GitRunResult =
  | { kind: 'exited'; code: number; stdout: string; stderr: string }
  // Not spawned, killed on a timeout, or drowned in its own output.
  | { kind: 'unavailable' };

// The one thing a host supplies: run git in the project folder, under `LC_ALL=C`
// so the message below is git's own and not a translation of it. Everything the
// answer means is decided here, so no two shells can classify it differently.
export type GitRun = (args: readonly string[]) => Promise<GitRunResult>;

// The shells' third capability, beside `FsAdapter` and `ProjectFileReader`:
// read-only, scoped to the repository around the project folder, and never
// reaching the board.
export interface GitHistoryReader {
  commitsForTask(taskId: string): Promise<GitHistoryResult>;
}

// Plain `git log` from HEAD: no `--no-merges` and no `--first-parent`, since a
// merge commit counts exactly like any other when its own subject carries the
// ID. `--grep` only narrows the history before the token rule runs below — it is
// a substring match, so it can over-match but never lose a commit — and
// `--fixed-strings` keeps an ID from being read as a regular expression.
//
// One line per commit, and the first space splits it: a short hash is hex, so it
// never holds one, and everything after it is the subject however it is spelled.
export const gitLogArgs = (taskId: string): string[] => [
  'log',
  '--abbrev=7',
  '--format=%h %s',
  '--fixed-strings',
  '--regexp-ignore-case',
  `--grep=${taskId}`,
];

export const GIT_REPO_PROBE_ARGS: readonly string[] = ['rev-parse', '--git-dir'];
export const GIT_HEAD_PROBE_ARGS: readonly string[] = [
  'rev-parse',
  '--verify',
  '--quiet',
  'HEAD',
];

// Git exits 128 both when there is no repository and when it found one and
// refuses to open it — dubious ownership, an unreadable `.git` — so the code
// alone cannot tell the two apart and only the message can. A host that failed to
// pin the locale falls through to unavailable, which is vaguer than the truth but
// never the lie that an existing repository is not initialized.
const NO_REPOSITORY = 'not a git repository';

const isNoRepositoryMessage = (stderr: string): boolean =>
  stderr.toLowerCase().includes(NO_REPOSITORY);

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[0-9a-z]/i.test(ch);

// Token boundaries, so `BD-36` matches inside `feat(BD-36): …` while `BD-360`
// and `XBD-36` do not. Scanned rather than compiled into a regular expression:
// an ID is data here, and escaping it would be one more rule to keep right.
export const subjectMentionsTask = (subject: string, taskId: string): boolean => {
  if (taskId === '') return false;
  const haystack = subject.toLowerCase();
  const needle = taskId.toLowerCase();
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) {
      return true;
    }
    from = at + 1;
  }
};

export const parseGitLog = (stdout: string, taskId: string): GitCommit[] =>
  stdout.split('\n').flatMap((raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const at = line.indexOf(' ');
    // A line with no hash or no subject is not a commit we can show.
    if (at <= 0 || at === line.length - 1) return [];
    const subject = line.slice(at + 1);
    return subjectMentionsTask(subject, taskId)
      ? [{ hash: line.slice(0, at), subject }]
      : [];
  });

// One `git log` on the happy path. The probes below run only when it fails,
// because `git log` fails the same way outside a repository and inside one that
// has no commits yet, and reporting either as the other would be a lie.
export const readTaskCommits = async (
  taskId: string,
  run: GitRun,
): Promise<GitHistoryResult> => {
  log.debug(`reading commits for ${taskId}`);
  const logged = await run(gitLogArgs(taskId));
  if (logged.kind === 'unavailable') return { state: 'git-unavailable', commits: [] };
  if (logged.code === 0) {
    return { state: 'ready', commits: parseGitLog(logged.stdout, taskId) };
  }

  const repo = await run(GIT_REPO_PROBE_ARGS);
  if (repo.kind === 'unavailable') return { state: 'git-unavailable', commits: [] };
  if (repo.code !== 0) {
    return isNoRepositoryMessage(repo.stderr)
      ? { state: 'not-a-repository', commits: [] }
      : { state: 'git-unavailable', commits: [] };
  }

  const head = await run(GIT_HEAD_PROBE_ARGS);
  if (head.kind === 'unavailable') return { state: 'git-unavailable', commits: [] };
  // A repository with no commits yet: initialized, and related to nothing.
  if (head.code !== 0) return { state: 'ready', commits: [] };

  log.debug(`git log exited ${logged.code} in a repository that has a HEAD`);
  return { state: 'git-unavailable', commits: [] };
};
