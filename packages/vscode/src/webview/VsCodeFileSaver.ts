import type { FileSaver } from '@boardown/core';
import type { SaveFileResponseMessage } from '../messages';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

// Same request/reply shape as the other webview capabilities. The host shows its
// Save-as dialog and writes where the user points it.
export class VsCodeFileSaver implements FileSaver {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: () => void; reject: (reason: Error) => void }
  >();

  constructor(private readonly vscode: VsCodeApi) {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as SaveFileResponseMessage | undefined;
      if (!message || message.type !== 'save-file-response') return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.ok) entry.resolve();
      else entry.reject(new Error(message.error ?? 'save failed'));
    });
  }

  save(name: string, content: Uint8Array): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.vscode.postMessage({ type: 'save-file-request', id, name, content });
    });
  }
}
