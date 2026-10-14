import { describe, expect, it } from 'vitest';
import { NO_LABELS, reconcileLabelFilter } from './label-filter';

describe('reconcileLabelFilter', () => {
  it('carries a selection over a rename that changes only case', () => {
    expect(reconcileLabelFilter(['backend'], ['Backend', 'ui'])).toEqual(['Backend']);
  });

  it('drops a label the registry lost and keeps the rest', () => {
    expect(reconcileLabelFilter(['backend', 'ui'], ['ui'])).toEqual(['ui']);
    expect(reconcileLabelFilter(['backend'], undefined)).toEqual([]);
  });

  it('always keeps the No labels row', () => {
    expect(reconcileLabelFilter([NO_LABELS, 'gone'], [])).toEqual([NO_LABELS]);
    expect(reconcileLabelFilter([NO_LABELS], undefined)).toEqual([NO_LABELS]);
  });

  it('returns the same array when nothing changed', () => {
    const selection = [NO_LABELS, 'ui'];
    expect(reconcileLabelFilter(selection, ['backend', 'ui'])).toBe(selection);
  });
});
