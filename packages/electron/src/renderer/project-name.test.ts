import { describe, expect, it } from 'vitest';
import { folderName, suggestIdPrefix } from './project-name';

describe('folderName', () => {
  it('returns the last segment of a POSIX path', () => {
    expect(folderName('/Users/me/gamedev/html-game')).toBe('html-game');
  });

  it('returns the last segment of a Windows path', () => {
    expect(folderName('C:\\Users\\me\\html-game')).toBe('html-game');
  });

  it('ignores a trailing separator', () => {
    expect(folderName('/Users/me/proj/')).toBe('proj');
  });

  it('returns the input when there is no separator', () => {
    expect(folderName('proj')).toBe('proj');
  });
});

describe('suggestIdPrefix', () => {
  it('uses word initials for a multi-word name', () => {
    expect(suggestIdPrefix('boardown-demo-empty')).toBe('BDE');
  });

  it('drops trailing digits when splitting into words', () => {
    expect(suggestIdPrefix('html-game-2')).toBe('HG');
  });

  it('uses the leading letters of a single word', () => {
    expect(suggestIdPrefix('demo')).toBe('DEMO');
  });

  it('caps the prefix at five letters', () => {
    expect(suggestIdPrefix('superlongprojectname')).toBe('SUPER');
  });

  it('returns empty when there are too few letters to be valid', () => {
    expect(suggestIdPrefix('x')).toBe('');
    expect(suggestIdPrefix('123')).toBe('');
    expect(suggestIdPrefix('')).toBe('');
  });
});
