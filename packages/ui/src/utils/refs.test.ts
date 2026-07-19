import { describe, expect, it } from 'vitest';
import { splitRefs, type RefSegment } from './refs';

const taskRefs = (segments: RefSegment[]): string[] =>
  segments.filter((s) => s.kind === 'task-ref').map((s) => s.id);

const docRefs = (segments: RefSegment[]): string[] =>
  segments.filter((s) => s.kind === 'doc-ref').map((s) => s.token);

const rejoin = (segments: RefSegment[]): string =>
  segments
    .map((s) => {
      if (s.kind === 'task-ref') return s.id;
      if (s.kind === 'doc-ref') return s.raw;
      return s.text;
    })
    .join('');

describe('splitRefs — task ids', () => {
  it('returns a single text segment when there is no reference', () => {
    expect(splitRefs('Plain description.')).toEqual([
      { kind: 'text', text: 'Plain description.' },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(splitRefs('')).toEqual([]);
  });

  it('splits a reference out of the surrounding text', () => {
    expect(splitRefs('Depends on BD-7.')).toEqual([
      { kind: 'text', text: 'Depends on ' },
      { kind: 'task-ref', id: 'BD-7' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('handles a description that is exactly one reference', () => {
    expect(splitRefs('BD-7')).toEqual([{ kind: 'task-ref', id: 'BD-7' }]);
  });

  it('ignores punctuation around a reference', () => {
    expect(taskRefs(splitRefs('(BD-7), BD-8; see BD-9!'))).toEqual([
      'BD-7',
      'BD-8',
      'BD-9',
    ]);
  });

  it('finds repeated references', () => {
    expect(taskRefs(splitRefs('BD-1 and BD-2 and BD-1 again'))).toEqual([
      'BD-1',
      'BD-2',
      'BD-1',
    ]);
  });

  it('takes the longest id, not a prefix of it', () => {
    expect(taskRefs(splitRefs('BD-70'))).toEqual(['BD-70']);
  });

  it('ignores ids glued to a word', () => {
    expect(taskRefs(splitRefs('xBD-7 BD-7x BD-7-1'))).toEqual([]);
  });

  it('is case-sensitive', () => {
    expect(taskRefs(splitRefs('bd-7 and Bd-7'))).toEqual([]);
  });

  it('respects the 2-5 letter prefix bounds', () => {
    expect(taskRefs(splitRefs('A-1 AB-1 ABCDE-1 ABCDEF-1'))).toEqual([
      'AB-1',
      'ABCDE-1',
    ]);
  });

  it('needs digits after the dash', () => {
    expect(taskRefs(splitRefs('BD- and BD-x'))).toEqual([]);
  });

  it('preserves the original text across segments', () => {
    const text = 'See BD-1,\n\n  then BD-22 (not bd-3).\n';
    expect(rejoin(splitRefs(text))).toBe(text);
  });
});

describe('splitRefs — doc references', () => {
  it('splits a wiki token out of the surrounding text', () => {
    expect(splitRefs('See [[architecture]].')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'doc-ref', token: 'architecture', raw: '[[architecture]]' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps a nested path', () => {
    expect(docRefs(splitRefs('[[guides/release-process]]'))).toEqual([
      'guides/release-process',
    ]);
  });

  it('trims the token but remembers the raw text', () => {
    const [segment] = splitRefs('[[  architecture  ]]');
    expect(segment).toEqual({
      kind: 'doc-ref',
      token: 'architecture',
      raw: '[[  architecture  ]]',
    });
  });

  it('leaves an empty token as plain text', () => {
    expect(splitRefs('a [[]] b [[   ]] c')).toEqual([
      { kind: 'text', text: 'a [[]] b [[   ]] c' },
    ]);
  });

  it('ignores unbalanced brackets', () => {
    expect(docRefs(splitRefs('[[architecture'))).toEqual([]);
    expect(docRefs(splitRefs('architecture]]'))).toEqual([]);
    expect(docRefs(splitRefs('[architecture]'))).toEqual([]);
  });

  it('accepts spaces inside a token', () => {
    expect(docRefs(splitRefs('[[my notes/first page]]'))).toEqual([
      'my notes/first page',
    ]);
  });

  it('does not span a newline', () => {
    expect(docRefs(splitRefs('[[arch\nitecture]]'))).toEqual([]);
  });

  it('claims a task id wrapped in brackets as a doc token', () => {
    expect(splitRefs('[[BD-7]]')).toEqual([
      { kind: 'doc-ref', token: 'BD-7', raw: '[[BD-7]]' },
    ]);
  });

  it('finds a task ref and a doc ref in one string', () => {
    const segments = splitRefs('BD-1 explains [[architecture]] best');
    expect(taskRefs(segments)).toEqual(['BD-1']);
    expect(docRefs(segments)).toEqual(['architecture']);
  });

  it('preserves the original text across segments', () => {
    const text = 'See [[a/b]] and BD-1, but not [[]] nor [[x';
    expect(rejoin(splitRefs(text))).toBe(text);
  });
});
