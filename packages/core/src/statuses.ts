import { DEFAULT_TASK_STATUSES, type BoardStatus, type TaskStatus } from './schemas.js';

// The one place that knows statuses are positional. Everything else asks a
// question ("is this the terminal one?") instead of counting indices itself.

// The whole board config satisfies this; so does nothing at all, which is what a
// surface rendering before a board is loaded has in hand. Either way the answer
// is the default set.
export type StatusConfig =
  | { readonly statuses?: readonly BoardStatus[] | undefined }
  | null
  | undefined;

export const boardStatuses = (config: StatusConfig): readonly BoardStatus[] =>
  config?.statuses ?? DEFAULT_TASK_STATUSES;

export const boardStatusKeys = (config: StatusConfig): readonly TaskStatus[] =>
  boardStatuses(config).map((s) => s.key);

// The config schema holds a declared list at 2-8 entries and the default holds
// three, so neither end can miss. The throw is for a config built past the
// schema — better a loud failure than a board with no first column.
const statusAt = (list: readonly BoardStatus[], index: number): BoardStatus => {
  const found = list[index];
  if (found === undefined) throw new Error('The board declares no statuses');
  return found;
};

/** -1 when the status is not declared on this board. */
export const statusIndex = (config: StatusConfig, status: TaskStatus): number =>
  boardStatuses(config).findIndex((s) => s.key === status);

export const isDeclaredStatus = (config: StatusConfig, status: TaskStatus): boolean =>
  statusIndex(config, status) !== -1;

export const initialStatus = (config: StatusConfig): TaskStatus =>
  statusAt(boardStatuses(config), 0).key;

export const terminalStatus = (config: StatusConfig): TaskStatus => {
  const all = boardStatuses(config);
  return statusAt(all, all.length - 1).key;
};

export const isTerminalStatus = (config: StatusConfig, status: TaskStatus): boolean =>
  status === terminalStatus(config);

/** A middle column: neither the initial nor the terminal status. Undeclared is never middle. */
export const isMiddleStatus = (config: StatusConfig, status: TaskStatus): boolean => {
  const i = statusIndex(config, status);
  return i > 0 && i < boardStatuses(config).length - 1;
};

export const middleStatusKeys = (config: StatusConfig): readonly TaskStatus[] =>
  boardStatuses(config)
    .slice(1, -1)
    .map((s) => s.key);

export const statusLabel = (config: StatusConfig, status: TaskStatus): string | undefined =>
  boardStatuses(config).find((s) => s.key === status)?.label;
