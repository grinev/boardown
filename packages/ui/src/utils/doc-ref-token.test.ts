import { describe, expect, it } from 'vitest';
import { findOpenDocRefToken } from './doc-ref-token';

describe('findOpenDocRefToken', () => {
  it('finds a token that has just been opened', () => {
    const text = 'See [[';
    expect(findOpenDocRefToken(text, text.length)).toEqual({ start: 4, query: '' });
  });

  it('carries the text typed so far as the query', () => {
    const text = 'See [[guides/rel';
    expect(findOpenDocRefToken(text, text.length)).toEqual({
      start: 4,
      query: 'guides/rel',
    });
  });

  it('finds nothing when no token was opened', () => {
    expect(findOpenDocRefToken('plain text', 10)).toBeNull();
  });

  it('closes once the token is completed', () => {
    const text = 'See [[intro]]';
    expect(findOpenDocRefToken(text, text.length)).toBeNull();
  });

  it('does not span a newline', () => {
    const text = '[[intro\nmore';
    expect(findOpenDocRefToken(text, text.length)).toBeNull();
  });

  it('takes the latest opening before the caret', () => {
    const text = '[[a]] then [[b';
    expect(findOpenDocRefToken(text, text.length)).toEqual({ start: 11, query: 'b' });
  });

  it('ignores text after the caret', () => {
    const text = '[[in]] tail';
    // Caret sits right after `[[in`, inside the token.
    expect(findOpenDocRefToken(text, 4)).toEqual({ start: 0, query: 'in' });
  });

  it('is closed when the caret sits before the opening', () => {
    expect(findOpenDocRefToken('See [[intro', 3)).toBeNull();
  });
});
