import { describe, expect, it } from 'vitest';
import { readAttachmentPreviews } from './attachment-previews.js';
import { ATTACHMENT_MAX_BYTES, type Attachment } from './attachments.js';
import type { FileStat, FsAdapter, FsEntry } from './fs-adapter.js';

class BytesFs implements FsAdapter {
  files = new Map<string, Uint8Array>();
  reads: string[] = [];

  async read(): Promise<string> {
    throw new Error('not used');
  }
  async write(): Promise<void> {
    throw new Error('not used');
  }
  async readBytes(path: string): Promise<Uint8Array> {
    this.reads.push(path);
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  async writeBytes(): Promise<void> {
    throw new Error('not used');
  }
  async list(): Promise<FsEntry[]> {
    return [];
  }
  async stat(path: string): Promise<FileStat | null> {
    const content = this.files.get(path);
    return content === undefined ? null : { size: content.byteLength, lastModified: 1 };
  }
  async mkdir(): Promise<void> {}
  async remove(): Promise<void> {}
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const at = (name: string, size: number): Attachment => ({
  name,
  size,
  path: `attachments/BD-1/${name}`,
});

describe('readAttachmentPreviews', () => {
  it('keeps the bytes of a real image and of an svg', async () => {
    const fs = new BytesFs();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    fs.files.set('attachments/BD-1/shot.png', png);
    fs.files.set('attachments/BD-1/logo.svg', svg);
    const previews = await readAttachmentPreviews(fs, [at('shot.png', 9), at('logo.svg', svg.length)]);
    expect(previews.get('shot.png')).toEqual(png);
    expect(previews.get('logo.svg')).toEqual(svg);
  });

  it('skips a text file named as an image and a file with no image name', async () => {
    const fs = new BytesFs();
    fs.files.set('attachments/BD-1/fake.png', new TextEncoder().encode('hello'));
    fs.files.set('attachments/BD-1/app.bin', png);
    const previews = await readAttachmentPreviews(fs, [at('fake.png', 5), at('app.bin', 9)]);
    expect(previews.size).toBe(0);
    expect(fs.reads).toEqual(['attachments/BD-1/fake.png']);
  });

  it('skips an image over the cap without reading it', async () => {
    const fs = new BytesFs();
    fs.files.set('attachments/BD-1/huge.png', png);
    const previews = await readAttachmentPreviews(fs, [at('huge.png', ATTACHMENT_MAX_BYTES + 1)]);
    expect(previews.size).toBe(0);
    expect(fs.reads).toEqual([]);
  });

  it('skips a file it cannot read and keeps the others', async () => {
    const fs = new BytesFs();
    fs.files.set('attachments/BD-1/shot.png', png);
    const previews = await readAttachmentPreviews(fs, [at('gone.png', 9), at('shot.png', 9)]);
    expect([...previews.keys()]).toEqual(['shot.png']);
  });
});
