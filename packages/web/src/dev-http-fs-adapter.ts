import type { FileStat, FsAdapter } from '@boardown/core';

export class DevHttpFsAdapter implements FsAdapter {
  constructor(private readonly base: string = '/api/fs') {}

  async read(path: string): Promise<string> {
    const res = await fetch(`${this.base}/read?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw new Error(`read ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.text();
  }

  async write(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.base}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) {
      throw new Error(`write ${path} failed: ${res.status} ${await res.text()}`);
    }
  }

  async list(dir: string): Promise<string[]> {
    const res = await fetch(`${this.base}/list?path=${encodeURIComponent(dir)}`);
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`list ${dir} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as string[];
  }

  async stat(path: string): Promise<FileStat | null> {
    const res = await fetch(`${this.base}/stat?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`stat ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as FileStat;
  }
}
