import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpProjectFileReader } from './http-project-file-reader';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpProjectFileReader', () => {
  it('turns a raw reply into an image carrying its bytes', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })),
    );
    expect(await new HttpProjectFileReader('/api/project-file').readFile('a.png')).toEqual({
      kind: 'image',
      bytes,
    });
  });

  it('parses every other reply as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ kind: 'binary' })),
    );
    expect(await new HttpProjectFileReader('/api/project-file').readFile('a.bin')).toEqual({
      kind: 'binary',
    });
  });
});
