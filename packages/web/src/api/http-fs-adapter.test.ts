import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_PATH_HEADER } from '../board-events-endpoint';
import { HttpFsAdapter } from './http-fs-adapter';

afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (response: () => Response): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
};

const missing = (): Response => new Response(null, { headers: { [MISSING_PATH_HEADER]: '1' } });

describe('HttpFsAdapter', () => {
  it('reads a missing path the way FsAdapter promises', async () => {
    reply(missing);
    const fs = new HttpFsAdapter();
    expect(await fs.stat('backlog.md')).toBeNull();
    expect(await fs.list('attachments/BD-1')).toEqual([]);
    await expect(fs.read('backlog.md')).rejects.toThrow('not found');
    await expect(fs.readBytes('attachments/BD-1/a.png')).rejects.toThrow('not found');
  });

  it('reads an empty file as an empty string', async () => {
    reply(() => new Response(''));
    expect(await new HttpFsAdapter().read('empty.md')).toBe('');
  });

  it('throws on a failure that does not carry the mark, 404 included', async () => {
    reply(() => new Response('No board registered as "shop"', { status: 404 }));
    const fs = new HttpFsAdapter('/b/shop/api/fs');
    await expect(fs.stat('config.yaml')).rejects.toThrow('404');
    await expect(fs.list('releases')).rejects.toThrow('404');
    reply(() => new Response('EISDIR', { status: 500 }));
    await expect(fs.read('epics')).rejects.toThrow('500');
  });
});
