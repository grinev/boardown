import type { Release } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { releaseOptionLabel } from './release-option';

const release = (status: 'future' | 'current' | 'finished', name?: string): Release => ({
  filename: 'releases/v1.md',
  slug: 'v1',
  preamble: '',
  frontmatter: { status, ...(name !== undefined ? { name } : {}) },
  tasks: [],
});

describe('releaseOptionLabel', () => {
  it('is the release name for a live release', () => {
    expect(releaseOptionLabel(release('current', 'Spring'))).toBe('Spring');
    expect(releaseOptionLabel(release('future'))).toBe('v1');
  });

  it('marks a finished release', () => {
    expect(releaseOptionLabel(release('finished', 'Spring'))).toBe('Spring (finished)');
  });
});
