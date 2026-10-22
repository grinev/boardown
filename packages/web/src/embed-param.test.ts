import { describe, expect, it } from 'vitest';
import { isEmbedRequested } from './embed-param';

describe('isEmbedRequested', () => {
  it.each(['?embed', '?embed=', '?embed=1', '?embed=true', '?embed=TRUE', '?embed=True'])(
    'turns on for %s',
    (search) => {
      expect(isEmbedRequested(search)).toBe(true);
    },
  );

  it.each(['', '?', '?embed=0', '?embed=false', '?embed=yes', '?embed=on', '?embedded'])(
    'stays off for %j',
    (search) => {
      expect(isEmbedRequested(search)).toBe(false);
    },
  );

  it('ignores the other parameters around it', () => {
    expect(isEmbedRequested('?foo=1&embed&bar=2')).toBe(true);
  });

  it('reads a repeated parameter by its first occurrence', () => {
    expect(isEmbedRequested('?embed=junk&embed=1')).toBe(false);
    expect(isEmbedRequested('?embed=1&embed=junk')).toBe(true);
  });
});
