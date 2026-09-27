import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { handleBoardFs, handleProjectFile, resolveContained } from './board-api';

const ROOT = path.resolve('/tmp/board-root');

describe('resolveContained', () => {
  it('resolves a relative path against the root', () => {
    const result = resolveContained(ROOT, 'releases/v1.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.abs).toBe(path.join(ROOT, 'releases/v1.md'));
      expect(result.rel).toBe(path.join('releases', 'v1.md'));
    }
  });

  it('accepts backslashes as separators', () => {
    const result = resolveContained(ROOT, 'releases\\v1.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.abs).toBe(path.join(ROOT, 'releases/v1.md'));
    }
  });

  it('refuses a missing path', () => {
    expect(resolveContained(ROOT, null)).toMatchObject({ ok: false, status: 400 });
    expect(resolveContained(ROOT, '')).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses an absolute path', () => {
    expect(resolveContained(ROOT, '/etc/passwd')).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a drive letter', () => {
    expect(resolveContained(ROOT, 'C:/Windows/system.ini')).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses an escape above the root', () => {
    expect(resolveContained(ROOT, '../secrets.txt')).toMatchObject({ ok: false, status: 400 });
    expect(resolveContained(ROOT, 'releases/../../secrets.txt')).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('allows a traversal that stays inside the root', () => {
    expect(resolveContained(ROOT, 'releases/../config.yaml').ok).toBe(true);
  });
});

describe('handleBoardFs bytes', () => {
  const call = async (
    root: string,
    method: string,
    url: string,
    body?: Uint8Array,
  ): Promise<{ status: number; body: Buffer }> => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]) as unknown as IncomingMessage;
    Object.assign(req, { method, headers: {} });
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader: () => undefined,
      end: (chunk?: string | Buffer) => {
        if (chunk !== undefined) chunks.push(Buffer.from(chunk));
      },
    } as unknown as ServerResponse;
    const parsed = new URL(url, 'http://localhost');
    await handleBoardFs(req, res, parsed.pathname, parsed.searchParams, root);
    return { status: res.statusCode, body: Buffer.concat(chunks) };
  };

  it('round-trips bytes that are not UTF-8 and reports their size', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bd-web-bytes-'));
    try {
      const bytes = new Uint8Array([0, 0xff, 0xfe, 0x80, 13, 10]);
      const target = encodeURIComponent('attachments/BD-1/a.bin');
      expect((await call(root, 'POST', `/api/fs/write-bytes?path=${target}`, bytes)).status).toBe(204);
      const read = await call(root, 'GET', `/api/fs/read-bytes?path=${target}`);
      expect(new Uint8Array(read.body)).toEqual(bytes);
      const stat = await call(root, 'GET', `/api/fs/stat?path=${target}`);
      expect((JSON.parse(stat.body.toString('utf-8')) as { size: number }).size).toBe(6);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('handleProjectFile', () => {
  const call = async (
    root: string,
    userPath: string,
  ): Promise<{ headers: Record<string, string>; body: Buffer }> => {
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      end: (chunk?: string | Uint8Array) => {
        if (chunk !== undefined) chunks.push(Buffer.from(chunk));
      },
    } as unknown as ServerResponse;
    await handleProjectFile(res, new URLSearchParams({ path: userPath }), root);
    return { headers, body: Buffer.concat(chunks) };
  };

  it('answers an image with its raw bytes, never typed as an image', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bd-web-image-'));
    try {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff]);
      await writeFile(path.join(root, 'shot.png'), bytes);
      const reply = await call(root, 'shot.png');
      expect(reply.headers['content-type']).toBe('application/octet-stream');
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
      expect(new Uint8Array(reply.body)).toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('still answers a text file as JSON', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bd-web-image-'));
    try {
      await writeFile(path.join(root, 'fake.png'), 'hello');
      const reply = await call(root, 'fake.png');
      expect(reply.headers['content-type']).toContain('application/json');
      expect(JSON.parse(reply.body.toString('utf-8'))).toEqual({ kind: 'text', text: 'hello' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
