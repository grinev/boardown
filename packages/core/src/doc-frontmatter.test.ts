import { describe, expect, it } from 'vitest';
import {
  fileFrontmatterPrefix,
  parseDocMetadata,
  parseDocPage,
  readFrontmatterPrefix,
} from './parser.js';

describe('document frontmatter-only reads', () => {
  it.each([
    'ordinary Markdown',
    '---\n---',
    '---\ntitle: Hola\n---\n\nBody',
    '---\ntitle: [malformed\n---\n\nBody',
    '---\r\ntitle: CRLF\r\n---\r\nBody',
    '---\ntitle: Unclosed\n---not a fence\nBody',
    `---\ntitle: ${'☕'.repeat(720)}\n---\n\n${'body'.repeat(720)}`,
  ])('preserves the doc parser result for %s', async (text) => {
    const bytes = new TextEncoder().encode(text);
    const prefix = await readFrontmatterPrefix(async (offset, length) =>
      bytes.subarray(offset, offset + Math.min(length, 29)),
    );
    expect(prefix).toBe(fileFrontmatterPrefix(text));
    const full = parseDocPage(text, 'docs/page.md', 'page');
    const partial = parseDocMetadata(prefix, 'docs/page.md', 'page');
    expect(partial.problems).toEqual(full.problems);
    expect(partial.value?.frontmatter).toEqual(full.value?.frontmatter);
    if (partial.value !== null) expect(partial.value).not.toHaveProperty('body');
  });

  it('stops reading near the header, not at the end of the body', async () => {
    const header = '---\ntitle: Actual title\n---';
    const bytes = new TextEncoder().encode(`\uFEFF${header}\n${'body'.repeat(50000)}`);
    let read = 0;
    expect(
      await readFrontmatterPrefix(async (offset, length) => {
        const chunk = bytes.subarray(offset, offset + length);
        read += chunk.length;
        return chunk;
      }, true),
    ).toBe(header);
    expect(read).toBeLessThan(1100);
    expect(
      await readFrontmatterPrefix(async (offset, length) =>
        bytes.subarray(offset, offset + length),
      ),
    ).toBe('');
  });
});
