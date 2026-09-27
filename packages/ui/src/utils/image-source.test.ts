import { describe, expect, it } from 'vitest';
import { imageSource } from './image-source';

describe('imageSource', () => {
  it('gives an svg a data: address, never a blob', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const source = imageSource(svg, 'docs/Logo.SVG');
    expect(source.kind).toBe('url');
    if (source.kind !== 'url') return;
    expect(source.url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(source.url.split(',')[1] ?? '', 'base64')).toEqual(Buffer.from(svg));
  });

  it('encodes an svg larger than one slice whole', () => {
    const svg = new Uint8Array(0x8000 * 2 + 7).map((_, i) => 0x41 + (i % 26));
    const source = imageSource(svg, 'big.svg');
    if (source.kind !== 'url') throw new Error('expected a data: address');
    expect(Buffer.from(source.url.split(',')[1] ?? '', 'base64')).toEqual(Buffer.from(svg));
  });

  it('gives a raster a blob typed by its extension', () => {
    const source = imageSource(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'shot.JPG');
    expect(source.kind).toBe('blob');
    if (source.kind !== 'blob') return;
    expect(source.blob.type).toBe('image/jpeg');
    expect(source.blob.size).toBe(4);
  });
});
