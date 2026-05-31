import type { FileStat, FsAdapter } from '@boardown/core';
import type { FsMethod, FsResponseMessage } from '../messages';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

// Mirror of packages/web DevHttpFsAdapter, but the transport is the VS Code
// webview message channel instead of HTTP: each call is a request the host
// answers via postMessage, correlated by a numeric id.
export class VsCodeFsAdapter implements FsAdapter {
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly vscode: VsCodeApi) {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as FsResponseMessage | undefined;
      if (!message || message.type !== 'fs-response') return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(message.error ?? 'fs operation failed'));
      }
    });
  }

  private request(method: FsMethod, path: string, content?: string): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.vscode.postMessage({ type: 'fs-request', id, method, path, content });
    });
  }

  async read(path: string): Promise<string> {
    return (await this.request('read', path)) as string;
  }

  async write(path: string, content: string): Promise<void> {
    await this.request('write', path, content);
  }

  async list(dir: string): Promise<string[]> {
    return (await this.request('list', dir)) as string[];
  }

  async stat(path: string): Promise<FileStat | null> {
    return (await this.request('stat', path)) as FileStat | null;
  }
}
