import { LUCIDE_ICON_NAMES } from '@boardown/core';
import { describe, expect, it } from 'vitest';
import { lucideIconFromName, lucideIconResolved } from './lucide-by-name';

describe('lucide-by-name', () => {
  it('resolves every name core accepts', () => {
    const missing = LUCIDE_ICON_NAMES.filter((name) => !lucideIconResolved(name));
    expect(missing).toEqual([]);
  });

  it('falls back to Circle for an unknown name', () => {
    expect(lucideIconFromName('not-an-icon')).toBe(lucideIconFromName('circle'));
  });
});
