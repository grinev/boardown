import type { ProjectFileRead, ProjectFileReader } from '@boardown/core';
import type { ProjectFileResponseMessage } from '../messages';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

// The second file capability, kept as its own object rather than a method on
// VsCodeFsAdapter: it reads the workspace folder, not `.boardown/`, and nothing
// that writes may ever hold it. Same transport, its own message type and its own
// correlation map.
export class VsCodeProjectFileReader implements ProjectFileReader {
  private nextId = 0;
  private readonly pending = new Map<number, (result: ProjectFileRead) => void>();

  constructor(private readonly vscode: VsCodeApi) {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as ProjectFileResponseMessage | undefined;
      if (!message || message.type !== 'project-file-response') return;
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      const result = message.result as ProjectFileRead;
      // The channel may hand the bytes back as a bare ArrayBuffer.
      const bytes: unknown = result.kind === 'image' ? result.bytes : null;
      if (bytes instanceof ArrayBuffer) {
        resolve({ kind: 'image', bytes: new Uint8Array(bytes) });
        return;
      }
      resolve(result);
    });
  }

  readFile(path: string): Promise<ProjectFileRead> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.vscode.postMessage({ type: 'project-file-request', id, path });
    });
  }
}
