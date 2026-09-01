import { createLogger, type GitHistoryReader, type GitHistoryResult } from '@boardown/core';
import { GIT_COMMITS_ENDPOINT } from '../git-history-endpoint.js';

const log = createLogger('web.git-history');

const UNAVAILABLE: GitHistoryResult = { state: 'git-unavailable', commits: [] };

// Takes the endpoint base, so it follows the /b/<id>/ prefix in registry mode.
export class HttpGitHistoryReader implements GitHistoryReader {
  constructor(private readonly base: string = GIT_COMMITS_ENDPOINT) {}

  async commitsForTask(taskId: string): Promise<GitHistoryResult> {
    const res = await fetch(`${this.base}?task=${encodeURIComponent(taskId)}`);
    if (!res.ok) {
      log.error(`git commits ${taskId} failed: ${String(res.status)}`);
      return UNAVAILABLE;
    }
    return (await res.json()) as GitHistoryResult;
  }
}
