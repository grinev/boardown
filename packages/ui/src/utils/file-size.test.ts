import { describe, expect, it } from 'vitest';
import { formatFileSize } from './file-size';

describe('formatFileSize', () => {
  it('counts bytes below a kilobyte', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('rounds kilobytes to whole numbers, 1024-based', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(160 * 1024 + 300)).toBe('160 KB');
  });

  it('moves up a unit when rounding would reach 1024', () => {
    expect(formatFileSize(1_048_500)).toBe('1.0 MB');
    expect(formatFileSize(1023 * 1024)).toBe('1023 KB');
  });

  it('gives megabytes and up one decimal', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25.0 MB');
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
