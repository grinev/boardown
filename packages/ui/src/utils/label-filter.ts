import { findLabel } from '@boardown/core';

// A label never contains whitespace, so this row value cannot equal one.
export const NO_LABELS = 'no labels';

// Keeps each selected label under the registry's current spelling, so a rename
// that changes only case keeps it ticked; one the registry lost is dropped. The
// same array comes back when nothing changed, so the state is left alone.
export const reconcileLabelFilter = (
  selection: string[],
  registry: readonly string[] | undefined,
): string[] => {
  const next: string[] = [];
  for (const value of selection) {
    if (value === NO_LABELS) {
      next.push(value);
      continue;
    }
    const current = registry === undefined ? undefined : findLabel(registry, value);
    if (current !== undefined) next.push(current);
  }
  const unchanged = next.length === selection.length && next.every((v, i) => v === selection[i]);
  return unchanged ? selection : next;
};
