import { LABEL_MAX_LENGTH, hasLabel, sameLabel } from '@boardown/core';

export interface LabelSuggestion {
  label: string;
  // The typed text itself, offered as a label the registry does not have yet.
  isNew: boolean;
}

// The registry's labels the task does not carry, alphabetically, narrowed by the
// typed text. Text that names no known label leads the list as a new one; text
// that names a registry label exactly puts that label first.
export const labelSuggestions = (
  registry: readonly string[],
  carried: readonly string[],
  text: string,
): LabelSuggestion[] => {
  const needle = text.toLowerCase();
  const matches = registry
    .filter((label) => !hasLabel(carried, label) && label.toLowerCase().includes(needle))
    .sort((a, b) => a.localeCompare(b));
  if (text === '') return matches.map((label) => ({ label, isNew: false }));
  const exact = matches.find((label) => sameLabel(label, text));
  if (exact !== undefined) {
    return [exact, ...matches.filter((label) => label !== exact)].map((label) => ({
      label,
      isNew: false,
    }));
  }
  const known = hasLabel(registry, text) || hasLabel(carried, text);
  const rows = matches.map((label) => ({ label, isNew: false }));
  return known ? rows : [{ label: text, isNew: true }, ...rows];
};

// Lit only when the first row is what the text names — the new label or the exact
// match — so Enter never adds a label the user merely typed part of.
export const defaultHighlight = (suggestions: readonly LabelSuggestion[], text: string): number | null => {
  const first = suggestions[0];
  if (text === '' || first === undefined) return null;
  return first.isNew || sameLabel(first.label, text) ? 0 : null;
};

// The input never holds whitespace, so pasted text becomes one label per word, each
// cut to the limit the input itself enforces.
export const splitLabelText = (text: string): string[] =>
  text
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => word.slice(0, LABEL_MAX_LENGTH));
