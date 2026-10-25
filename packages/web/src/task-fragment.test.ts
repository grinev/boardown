import { describe, expect, it } from 'vitest';
import { taskIdFromHash, urlWithoutHash } from './task-fragment';

describe('taskIdFromHash', () => {
  it('reads the task key', () => {
    expect(taskIdFromHash('#task=BD-12')).toBe('BD-12');
  });

  it('keeps the case it was given; resolving it is the store’s job', () => {
    expect(taskIdFromHash('#task=bd-12')).toBe('bd-12');
  });

  it('reads a repeated key by its first occurrence', () => {
    expect(taskIdFromHash('#task=BD-1&task=BD-2')).toBe('BD-1');
  });

  it('ignores the other keys around it', () => {
    expect(taskIdFromHash('#foo=1&task=BD-3&bar')).toBe('BD-3');
  });

  it('decodes a percent-encoded value', () => {
    expect(taskIdFromHash('#task=BD%2D12')).toBe('BD-12');
  });

  it('turns a malformed escape into an id nobody has instead of throwing', () => {
    expect(() => taskIdFromHash('#task=%E0%A4')).not.toThrow();
    expect(taskIdFromHash('#task=%E0%A4')).not.toBeNull();
  });

  it.each(['', '#', '#task', '#task=', '#task=%20%20', '#foo=BD-1', '#BD-1'])(
    'finds no task in %j',
    (hash) => {
      expect(taskIdFromHash(hash)).toBeNull();
    },
  );
});

describe('urlWithoutHash', () => {
  it('keeps the path and the query', () => {
    expect(urlWithoutHash({ pathname: '/b/shop/', search: '?embed' })).toBe('/b/shop/?embed');
    expect(urlWithoutHash({ pathname: '/', search: '' })).toBe('/');
  });
});
