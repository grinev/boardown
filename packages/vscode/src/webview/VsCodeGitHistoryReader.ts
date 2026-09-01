import type { GitHistoryReader, GitHistoryResult } from '@boardown/core';
import type { GitCommitsResponseMessage } from '../messages';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

// Same shape as VsCodeProjectFileReader: post a request, resolve on the reply
// carrying the same id. The host decides nothing — it runs git and hands the
// result core produced straight back.
export class VsCodeGitHistoryReader implements GitHistoryReader {
  private nextId = 0;
  private readonly pending = new Map<number, (result: GitHistoryResult) => void>();

  constructor(private readonly vscode: VsCodeApi) {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as GitCommitsResponseMessage | undefined;
      if (!message || message.type !== 'git-commits-response') return;
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      resolve(message.result as GitHistoryResult);
    });
  }

  commitsForTask(taskId: string): Promise<GitHistoryResult> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.vscode.postMessage({ type: 'git-commits-request', id, taskId });
    });
  }
}
