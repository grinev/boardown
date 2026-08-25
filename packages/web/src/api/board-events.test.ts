import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleBoardFs } from './board-api';
import { createBoardWatchHub, type BoardWatchHub } from './board-events';
import { CLIENT_ID_HEADER } from '../board-events-endpoint';

// The hub is exercised over a real HTTP server: what it writes is an event
// stream, and a stub response object would test the shape of the mock instead.

let dir = '';
let hub: BoardWatchHub | null = null;
let server: http.Server | null = null;
let port = 0;

interface Stream {
  events: number;
  close: () => void;
}

const open = (boardRoot: string, clientId: string): Promise<Stream> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/events?client=${clientId}&root=${encodeURIComponent(boardRoot)}`,
      },
      (res) => {
        const stream: Stream = { events: 0, close: () => req.destroy() };
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => {
          stream.events += chunk.split('event: board-changed').length - 1;
        });
        res.on('error', () => {});
        // The headers are flushed before the first event, so the stream is live
        // as soon as the response arrives.
        resolve(stream);
      },
    );
    req.on('error', reject);
    req.end();
  });

// A write through the real endpoint, carrying the header that names the tab —
// the path a browser actually takes, and the only place the header is read.
const write = (boardRoot: string, relative: string, clientId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: `/api/fs/write?root=${encodeURIComponent(boardRoot)}`,
        headers: { 'Content-Type': 'application/json', [CLIENT_ID_HEADER]: clientId },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ path: relative, content: `# ${Date.now()}\n` }));
  });

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 700));

const touch = async (...segments: string[]): Promise<string> => {
  const target = path.join(...segments);
  await fs.writeFile(target, `# ${Date.now()}\n`, 'utf-8');
  return target;
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-events-'));
  await fs.mkdir(path.join(dir, 'one', 'docs', 'guides'), { recursive: true });
  await fs.mkdir(path.join(dir, 'two'), { recursive: true });
  hub = createBoardWatchHub();
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const root = url.searchParams.get('root') ?? dir;
    if (url.pathname.startsWith('/api/fs/')) {
      void handleBoardFs(req, res, url.pathname, url.searchParams, root, hub ?? undefined);
      return;
    }
    hub?.openStream(res, url.searchParams, root);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
});

afterEach(async () => {
  hub?.close();
  hub = null;
  await new Promise((resolve) => server?.close(resolve));
  server = null;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the board watch hub', () => {
  it('collapses a burst of changes into one refresh', async () => {
    const board = path.join(dir, 'one');
    const stream = await open(board, 'a');
    await touch(board, 'config.yaml');
    await touch(board, 'first.md');
    await touch(board, 'second.md');
    await settle();
    expect(stream.events).toBe(1);
  });

  it('skips a change the connection made itself', async () => {
    const board = path.join(dir, 'one');
    const stream = await open(board, 'a');
    const target = path.join(board, 'config.yaml');
    hub?.noteWrite(board, 'a', target);
    await touch(board, 'config.yaml');
    await settle();
    expect(stream.events).toBe(0);
  });

  it('skips a change beneath a folder the connection wrote', async () => {
    const board = path.join(dir, 'one');
    const stream = await open(board, 'a');
    hub?.noteWrite(board, 'a', path.join(board, 'docs'));
    await touch(board, 'docs', 'guides', 'note.md');
    await settle();
    expect(stream.events).toBe(0);
  });

  it('still refreshes a sibling tab on the same board', async () => {
    const board = path.join(dir, 'one');
    const writer = await open(board, 'a');
    const sibling = await open(board, 'b');
    hub?.noteWrite(board, 'a', path.join(board, 'config.yaml'));
    await touch(board, 'config.yaml');
    await settle();
    expect(writer.events).toBe(0);
    expect(sibling.events).toBe(1);
  });

  it('leaves a stale record no longer suppressing', async () => {
    const board = path.join(dir, 'one');
    const stream = await open(board, 'a');
    // Older than the 2 s echo window, so it is dropped rather than obeyed.
    hub?.noteWrite(board, 'a', path.join(board, 'config.yaml'));
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await touch(board, 'config.yaml');
    await settle();
    expect(stream.events).toBe(1);
  });

  it('keeps one board off another board tab', async () => {
    const one = path.join(dir, 'one');
    const two = path.join(dir, 'two');
    const onStreamOne = await open(one, 'a');
    const onStreamTwo = await open(two, 'b');
    await touch(one, 'config.yaml');
    await settle();
    expect(onStreamOne.events).toBe(1);
    expect(onStreamTwo.events).toBe(0);
  });

  it('does not refresh the tab whose own write went through the endpoint', async () => {
    const board = path.join(dir, 'one');
    const writer = await open(board, 'a');
    const sibling = await open(board, 'b');
    await write(board, 'config.yaml', 'a');
    await settle();
    expect(writer.events).toBe(0);
    expect(sibling.events).toBe(1);
  });

  it('does not refresh the writing tab when the write creates its folder', async () => {
    const board = path.join(dir, 'one');
    const writer = await open(board, 'a');
    // releases/ does not exist yet, so the write makes it — and that folder is an
    // ancestor of the file, not a path beneath it.
    await write(board, 'releases/v0.1.0.md', 'a');
    await settle();
    expect(writer.events).toBe(0);
  });

  it('drops a write recorded for a client with no open stream', async () => {
    const board = path.join(dir, 'one');
    const stream = await open(board, 'a');
    hub?.noteWrite(board, 'nobody', path.join(board, 'config.yaml'));
    await touch(board, 'config.yaml');
    await settle();
    expect(stream.events).toBe(1);
  });

  it('watches a board only while a tab is on it', async () => {
    const board = path.join(dir, 'one');
    expect(hub?.watchedRoots()).toEqual([]);
    const first = await open(board, 'a');
    const second = await open(board, 'b');
    expect(hub?.watchedRoots()).toEqual([board]);

    first.close();
    await settle();
    expect(hub?.watchedRoots()).toEqual([board]);

    second.close();
    await settle();
    expect(hub?.watchedRoots()).toEqual([]);

    // And a board picked up again still reports.
    const again = await open(board, 'c');
    expect(hub?.watchedRoots()).toEqual([board]);
    await touch(board, 'config.yaml');
    await settle();
    expect(again.events).toBe(1);
  });
});
