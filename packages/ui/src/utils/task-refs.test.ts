import { describe, expect, it } from 'vitest';
import { splitTaskRefs, type TaskRefSegment } from './task-refs';

const refs = (segments: TaskRefSegment[]): string[] =>
  segments.filter((s) => s.kind === 'ref').map((s) => s.id);

const rejoin = (segments: TaskRefSegment[]): string =>
  segments.map((s) => (s.kind === 'ref' ? s.id : s.text)).join('');

describe('splitTaskRefs', () => {
  it('returns a single text segment when there is no reference', () => {
    expect(splitTaskRefs('Plain description.')).toEqual([
      { kind: 'text', text: 'Plain description.' },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(splitTaskRefs('')).toEqual([]);
  });

  it('splits a reference out of the surrounding text', () => {
    expect(splitTaskRefs('Depends on BD-7.')).toEqual([
      { kind: 'text', text: 'Depends on ' },
      { kind: 'ref', id: 'BD-7' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('handles a description that is exactly one reference', () => {
    expect(splitTaskRefs('BD-7')).toEqual([{ kind: 'ref', id: 'BD-7' }]);
  });

  it('ignores punctuation around a reference', () => {
    expect(refs(splitTaskRefs('(BD-7), BD-8; see BD-9!'))).toEqual([
      'BD-7',
      'BD-8',
      'BD-9',
    ]);
  });

  it('finds repeated references', () => {
    expect(refs(splitTaskRefs('BD-1 and BD-2 and BD-1 again'))).toEqual([
      'BD-1',
      'BD-2',
      'BD-1',
    ]);
  });

  it('takes the longest id, not a prefix of it', () => {
    expect(refs(splitTaskRefs('BD-70'))).toEqual(['BD-70']);
  });

  it('ignores ids glued to a word', () => {
    expect(refs(splitTaskRefs('xBD-7 BD-7x BD-7-1'))).toEqual([]);
  });

  it('is case-sensitive', () => {
    expect(refs(splitTaskRefs('bd-7 and Bd-7'))).toEqual([]);
  });

  it('respects the 2-5 letter prefix bounds', () => {
    expect(refs(splitTaskRefs('A-1 AB-1 ABCDE-1 ABCDEF-1'))).toEqual([
      'AB-1',
      'ABCDE-1',
    ]);
  });

  it('needs digits after the dash', () => {
    expect(refs(splitTaskRefs('BD- and BD-x'))).toEqual([]);
  });

  it('preserves the original text across segments', () => {
    const text = 'See BD-1,\n\n  then BD-22 (not bd-3).\n';
    expect(rejoin(splitTaskRefs(text))).toBe(text);
  });
});
