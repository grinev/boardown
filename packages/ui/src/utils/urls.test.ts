import { describe, expect, it } from 'vitest';
import { splitUrls, trimUrlEnd } from './urls';

describe('trimUrlEnd', () => {
  it('keeps a URL that ends in nothing punctuation-like', () => {
    expect(trimUrlEnd('https://example.com/a')).toBe('https://example.com/a');
  });

  it('drops a trailing sentence stop', () => {
    expect(trimUrlEnd('https://example.com/a.')).toBe('https://example.com/a');
  });

  it.each([',', ';', ':', '!', '?'])('drops a trailing %s', (mark) => {
    expect(trimUrlEnd(`https://example.com/a${mark}`)).toBe('https://example.com/a');
  });

  it('drops a run of trailing punctuation', () => {
    expect(trimUrlEnd('https://example.com/a?!...')).toBe('https://example.com/a');
  });

  it('drops a closing paren the URL never opened', () => {
    expect(trimUrlEnd('https://example.com/a)')).toBe('https://example.com/a');
  });

  it('keeps a balanced pair inside the URL', () => {
    expect(trimUrlEnd('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    );
  });

  it('keeps the pair the URL opened and drops the one the writer did', () => {
    expect(trimUrlEnd('https://en.wikipedia.org/wiki/Foo_(bar))')).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    );
  });

  it('trims punctuation that sits behind an unopened paren', () => {
    expect(trimUrlEnd('https://example.com/a).')).toBe('https://example.com/a');
  });

  it('is not a URL when nothing survives the scheme', () => {
    expect(trimUrlEnd('https://')).toBe('');
    expect(trimUrlEnd('https://.')).toBe('');
    expect(trimUrlEnd('http://!?')).toBe('');
  });

  it('keeps a query string with its own punctuation', () => {
    expect(trimUrlEnd('https://example.com/s?q=a,b&n=1')).toBe(
      'https://example.com/s?q=a,b&n=1',
    );
  });
});

describe('splitUrls', () => {
  it('returns a single text piece when there is no URL', () => {
    expect(splitUrls('Plain text with no link.')).toEqual([
      { kind: 'text', text: 'Plain text with no link.' },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(splitUrls('')).toEqual([]);
  });

  it('splits a URL out of the surrounding text', () => {
    expect(splitUrls('see https://example.com/a for more')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', url: 'https://example.com/a' },
      { kind: 'text', text: ' for more' },
    ]);
  });

  it('hands the trailing stop back to the text', () => {
    expect(splitUrls('see https://example.com/a.')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', url: 'https://example.com/a' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('finds a URL at the very start and at the very end', () => {
    expect(splitUrls('https://a.example')).toEqual([
      { kind: 'url', url: 'https://a.example' },
    ]);
    expect(splitUrls('go http://b.example')).toEqual([
      { kind: 'text', text: 'go ' },
      { kind: 'url', url: 'http://b.example' },
    ]);
  });

  it('finds several URLs in one string', () => {
    expect(splitUrls('https://a.example and https://b.example')).toEqual([
      { kind: 'url', url: 'https://a.example' },
      { kind: 'text', text: ' and ' },
      { kind: 'url', url: 'https://b.example' },
    ]);
  });

  it('leaves a degenerate scheme as text', () => {
    expect(splitUrls('scheme https:// alone')).toEqual([
      { kind: 'text', text: 'scheme https:// alone' },
    ]);
  });

  it('leaves other schemes and a bare www alone', () => {
    expect(splitUrls('mailto:a@b.example ftp://x file:///y www.example.com')).toEqual([
      { kind: 'text', text: 'mailto:a@b.example ftp://x file:///y www.example.com' },
    ]);
  });

  it('stops a URL at a newline', () => {
    expect(splitUrls('https://a.example\nnext line')).toEqual([
      { kind: 'url', url: 'https://a.example' },
      { kind: 'text', text: '\nnext line' },
    ]);
  });
});

describe('splitUrls — scheme casing', () => {
  it('matches a scheme written in any case, as remark-gfm does', () => {
    expect(splitUrls('go HTTP://Example.com/A now')).toEqual([
      { kind: 'text', text: 'go ' },
      { kind: 'url', url: 'HTTP://Example.com/A' },
      { kind: 'text', text: ' now' },
    ]);
    expect(splitUrls('HtTpS://example.com')).toEqual([
      { kind: 'url', url: 'HtTpS://example.com' },
    ]);
  });
});

describe('trimUrlEnd — unopened square brackets', () => {
  it('drops the closing brackets of a wiki token wrapped around a URL', () => {
    expect(trimUrlEnd('https://example.com]]')).toBe('https://example.com');
  });

  it('keeps brackets the URL opened itself', () => {
    expect(trimUrlEnd('https://example.com/a[b]')).toBe('https://example.com/a[b]');
    expect(trimUrlEnd('https://example.com/[[y]]')).toBe('https://example.com/[[y]]');
  });

  it('drops an unopened bracket together with sentence punctuation', () => {
    expect(trimUrlEnd('https://example.com].')).toBe('https://example.com');
  });
});

describe('splitUrls — a URL inside a wiki token in repo content', () => {
  it('leaves both pairs of brackets as text', () => {
    expect(splitUrls('[[https://example.com]] must stay literal too.')).toEqual([
      { kind: 'text', text: '[[' },
      { kind: 'url', url: 'https://example.com' },
      { kind: 'text', text: ']] must stay literal too.' },
    ]);
  });
});
