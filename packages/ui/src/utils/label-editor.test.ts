import { describe, expect, it } from 'vitest';
import { defaultHighlight, labelSuggestions, splitLabelText } from './label-editor';

// One script only: how Latin sorts against Cyrillic depends on the machine's locale.
const registry = ['ui', 'backend', 'Build', 'docs'];

describe('labelSuggestions', () => {
  it('lists the registry labels the task lacks, alphabetically', () => {
    expect(labelSuggestions(registry, ['UI'], '').map((s) => s.label)).toEqual([
      'backend',
      'Build',
      'docs',
    ]);
  });

  it('filters by a case-insensitive substring and leads with a new label', () => {
    expect(labelSuggestions(registry, [], 'U')).toEqual([
      { label: 'U', isNew: true },
      { label: 'Build', isNew: false },
      { label: 'ui', isNew: false },
    ]);
  });

  it('puts an exact match first instead of a new row', () => {
    expect(labelSuggestions(registry, [], 'UI')).toEqual([
      { label: 'ui', isNew: false },
      { label: 'Build', isNew: false },
    ]);
  });

  it('offers no new row for text the task already carries', () => {
    expect(labelSuggestions(registry, ['legacy'], 'LEGACY')).toEqual([]);
    expect(labelSuggestions(registry, ['ui'], 'ui')).toEqual([{ label: 'Build', isNew: false }]);
  });
});

describe('defaultHighlight', () => {
  it('lights the new row or the exact match, nothing otherwise', () => {
    expect(defaultHighlight(labelSuggestions(registry, [], ''), '')).toBeNull();
    expect(defaultHighlight(labelSuggestions(registry, [], 'x'), 'x')).toBe(0);
    expect(defaultHighlight(labelSuggestions(registry, [], 'ui'), 'ui')).toBe(0);
    expect(defaultHighlight(labelSuggestions(registry, ['ui'], 'ui'), 'ui')).toBeNull();
  });
});

describe('splitLabelText', () => {
  it('splits on any whitespace and cuts each word to the limit', () => {
    expect(splitLabelText('  a b\tc\nd  ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitLabelText('x'.repeat(30))).toEqual(['x'.repeat(28)]);
    expect(splitLabelText('   ')).toEqual([]);
  });
});
