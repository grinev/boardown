import type { FileStat, FsAdapter, FsEntry } from '@boardown/core';
import { createLogger } from '@boardown/core';

const log = createLogger('web.fs-adapter');

// Every failed request is logged before it is thrown, so the run's log file
// records the transport failure even when the caller turns it into an on-screen
// message that the user then dismisses.
const failed = async (op: string, target: string, res: Response): Promise<Error> => {
  const error = new Error(`${op} ${target} failed: ${res.status} ${await res.text()}`);
  log.error(error.message);
  return error;
};

export class DevHttpFsAdapter implements FsAdapter {
  constructor(private readonly base: string = '/api/fs') {}

  async read(path: string): Promise<string> {
    const res = await fetch(`${this.base}/read?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw await failed('read', path, res);
    }
    log.debug(`read ${path}`);
    return res.text();
  }

  async write(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.base}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) {
      throw await failed('write', path, res);
    }
    log.debug(`write ${path} (${content.length} chars)`);
  }

  async list(dir: string): Promise<FsEntry[]> {
    const res = await fetch(`${this.base}/list?path=${encodeURIComponent(dir)}`);
    if (res.status === 404) return [];
    if (!res.ok) {
      throw await failed('list', dir, res);
    }
    const entries = (await res.json()) as FsEntry[];
    log.debug(`list ${dir} (${entries.length} entries)`);
    return entries;
  }

  async mkdir(dir: string): Promise<void> {
    const res = await fetch(`${this.base}/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dir }),
    });
    if (!res.ok) {
      throw await failed('mkdir', dir, res);
    }
    log.debug(`mkdir ${dir}`);
  }

  async remove(path: string): Promise<void> {
    const res = await fetch(`${this.base}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      throw await failed('remove', path, res);
    }
    log.debug(`remove ${path}`);
  }

  async stat(path: string): Promise<FileStat | null> {
    const res = await fetch(`${this.base}/stat?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw await failed('stat', path, res);
    }
    log.debug(`stat ${path}`);
    return (await res.json()) as FileStat;
  }
}
