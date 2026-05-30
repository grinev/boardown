import { describe, expect, it } from 'vitest';
import { formatStatusLabel } from './format-status';

describe('formatStatusLabel', () => {
  it('capitalises and spaces a hyphenated status', () => {
    expect(formatStatusLabel('in-progress')).toBe('In progress');
  });

  it('capitalises a single word', () => {
    expect(formatStatusLabel('todo')).toBe('Todo');
  });

  it('normalises underscores too', () => {
    expect(formatStatusLabel('foo_bar')).toBe('Foo bar');
  });

  it('returns the original slug when it normalises to empty', () => {
    expect(formatStatusLabel('-')).toBe('-');
    expect(formatStatusLabel('')).toBe('');
  });
});
