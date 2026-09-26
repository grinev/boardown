import type { BoardConfig } from './schemas.js';

// The epic name limit, known to fit a board card on one line. Enforced when a
// label is written, never when one is read: a hand-edited longer label loads.
export const LABEL_MAX_LENGTH = 28;

const WHITESPACE = /\s/;

// The one label rule, shared by the config registry, the board-ops, the CLI and
// the editor, so none of them can disagree about which labels are refused.
export const validateLabel = (label: string): string | null => {
  if (label.length === 0) return 'Label must not be empty.';
  if (WHITESPACE.test(label)) return `Label must not contain whitespace (got "${label}").`;
  if (label.length > LABEL_MAX_LENGTH) {
    return `Label must be at most ${LABEL_MAX_LENGTH} characters (got ${label.length}).`;
  }
  return null;
};

// One spelling per label: `Backend` and `backend` are the same label everywhere.
export const sameLabel = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const findLabel = (labels: readonly string[], label: string): string | undefined =>
  labels.find((l) => sameLabel(l, label));

export const hasLabel = (labels: readonly string[], label: string): boolean =>
  findLabel(labels, label) !== undefined;

export const resolveLabel = (registry: readonly string[] | undefined, label: string): string =>
  (registry === undefined ? undefined : findLabel(registry, label)) ?? label;

// Carried labels keep their own spelling; incoming ones take the registry's and
// are appended in the order given, each at most once.
export const addLabels = (
  current: readonly string[],
  incoming: readonly string[],
  registry: readonly string[] | undefined,
): string[] => {
  const next = [...current];
  for (const raw of incoming) {
    const label = resolveLabel(registry, raw);
    if (!hasLabel(next, label)) next.push(label);
  }
  return next;
};

export const removeLabels = (current: readonly string[], outgoing: readonly string[]): string[] =>
  current.filter((l) => !hasLabel(outgoing, l));

// Only labels an edit added come here, so a label a task already carried never
// reaches the registry by being written back.
export const withLabelsInRegistry = (config: BoardConfig, added: readonly string[]): BoardConfig => {
  const registry = config.labels ?? [];
  const missing: string[] = [];
  for (const label of added) {
    if (!hasLabel(registry, label) && !hasLabel(missing, label)) missing.push(label);
  }
  if (missing.length === 0) return config;
  return { ...config, labels: [...registry, ...missing] };
};
