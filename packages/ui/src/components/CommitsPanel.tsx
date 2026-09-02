import { createLogger, type GitHistoryResult } from '@boardown/core';
import { useEffect, useState } from 'react';
import { useBoardStore } from '../store';
import { formatCommitDate } from '../utils/format-commit-date';
import styles from './CommitsPanel.module.css';

const log = createLogger('ui.commits-panel');

const UNAVAILABLE: GitHistoryResult = { state: 'git-unavailable', commits: [] };

const EMPTY_MESSAGE: Record<GitHistoryResult['state'], string> = {
  ready: 'No related commits',
  'not-a-repository': 'Git is not initialized',
  'git-unavailable': 'Git is unavailable',
};

// Read once per open, and held nowhere else: related commits are the state of a
// repository, not board data, so nothing about them belongs in the snapshot.
export function CommitsPanel({ taskId }: { taskId: string }) {
  const gitHistory = useBoardStore((s) => s.gitHistory);
  const [result, setResult] = useState<GitHistoryResult | null>(null);

  useEffect(() => {
    let current = true;
    setResult(null);
    const run = async (): Promise<GitHistoryResult> => {
      if (gitHistory === null) return UNAVAILABLE;
      try {
        return await gitHistory.commitsForTask(taskId);
      } catch (err) {
        // Shown in the panel and never reaching errorMessage, so this is the
        // only record of it in the run's log.
        log.error(
          `commits for ${taskId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return UNAVAILABLE;
      }
    };
    void run().then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [taskId, gitHistory]);

  return (
    <section className={styles.card} aria-labelledby="commits-heading">
      <h3 className={styles.heading} id="commits-heading">
        Commits
      </h3>
      {result === null && <p className={styles.message}>Loading…</p>}
      {result !== null &&
        (result.commits.length === 0 ? (
          <p className={styles.message}>{EMPTY_MESSAGE[result.state]}</p>
        ) : (
          <ul className={styles.list}>
            {result.commits.map((commit) => (
              <li key={commit.hash} className={styles.row}>
                <span className={styles.subject}>{commit.subject}</span>
                <span className={styles.date}>{formatCommitDate(commit.date)}</span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
