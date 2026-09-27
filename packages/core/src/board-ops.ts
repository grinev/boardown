import { nextTaskId } from './id-generator.js';
import {
  addLabels,
  findLabel,
  hasLabel,
  resolveLabel,
  validateLabel,
  withLabelsInRegistry,
} from './labels.js';
import { LINK_TYPE_META, WIP_LIMIT_KEY } from './schemas.js';
import {
  boardStatusKeys,
  initialStatus,
  isDeclaredStatus,
  isMiddleStatus,
  terminalStatus,
} from './statuses.js';
import { enabledTaskTypeKeys, isEnabledTaskType } from './task-types.js';
import type {
  Backlog,
  BoardConfig,
  ChecklistItem,
  CustomField,
  Epic,
  LinkType,
  Note,
  Release,
  ReleaseStatus,
  Task,
  TaskLink,
  TaskPriority,
  TaskStatus,
  TaskType,
} from './schemas.js';

export const DEFAULT_EPIC_SLUG = 'no-epic';

export const RELEASES_DIR = 'releases';

export const EPICS_DIR = 'epics';

// Every task in no release, whatever its epic.
export const BACKLOG_PATH = 'backlog.md';

export const DOCS_DIR = 'docs';

// A task's files live under its id, which never changes — moving the task never
// moves them.
export const ATTACHMENTS_DIR = 'attachments';

export const attachmentsDir = (taskId: string): string => `${ATTACHMENTS_DIR}/${taskId}`;

export type Container = Release | Backlog;

// An empty backlog stand-in for boards that have no `backlog.md` yet. The file is
// written lazily the first time a task lands in the backlog.
export const emptyBacklog = (): Backlog => ({
  filename: BACKLOG_PATH,
  frontmatter: {},
  preamble: '',
  tasks: [],
});

export type BoardOpErrorCode =
  | 'ARCHIVED'
  | 'STATUS_LOCKED'
  | 'WIP_LIMIT'
  | 'UNKNOWN_STATUS'
  | 'UNKNOWN_TYPE';

// A process invariant refused a board operation. The code is what lets a shell
// tell the rules apart — the CLI maps it straight onto its own error code.
export class BoardOpError extends Error {
  readonly code: BoardOpErrorCode;
  constructor(code: BoardOpErrorCode, message: string) {
    super(message);
    this.name = 'BoardOpError';
    this.code = code;
  }
}

// `status` only exists on a Release frontmatter, so the `in` check narrows the
// union safely.
export const isFinishedRelease = (container: Container): boolean =>
  'status' in container.frontmatter && container.frontmatter.status === 'finished';

// A finished release is archived: the product treats its task content as frozen
// and forbids scheduling new work into it, unless `editFinishedReleases` lifts the
// freeze. Links are metadata and may still change either way; every other mutation
// is refused here so every shell inherits the rule.
export const isFrozenRelease = (container: Container, config: BoardConfig): boolean =>
  isFinishedRelease(container) && config.editFinishedReleases !== true;

// A task's status only means something while its release is being worked on — the
// Board shows the current release alone. So a status may only *change* there,
// unless `statusOutsideActiveRelease` lifts the lock. A finished release is
// ARCHIVED ahead of it unless `editFinishedReleases` is on, and then this lock
// applies to it as to any other release that is not current. Moving a task around
// never changes its status, so it is unaffected.
const isCurrentRelease = (container: Container): boolean =>
  'status' in container.frontmatter && container.frontmatter.status === 'current';

const isStatusChangeLocked = (container: Container, config: BoardConfig): boolean =>
  !isCurrentRelease(container) && config.statusOutsideActiveRelease !== true;

const describeContainer = (container: Container): string => {
  // The backlog is the one container without a slug.
  if (!('slug' in container)) return 'the backlog';
  return `the ${container.frontmatter.status} release "${container.frontmatter.name ?? container.slug}"`;
};

const refuseStatusChange = (container: Container, taskId: string): never => {
  throw new BoardOpError(
    'STATUS_LOCKED',
    `Cannot change the status of ${taskId}: it is in ${describeContainer(container)}. ` +
      "A task's status can only be changed in the current release.",
  );
};

// A board only accepts the statuses it declares. The refusal lives here so the UI
// and the CLI inherit it rather than each policing their own controls.
const refuseUndeclaredStatus = (
  config: BoardConfig,
  subject: string,
  status: TaskStatus,
): void => {
  if (isDeclaredStatus(config, status)) return;
  throw new BoardOpError(
    'UNKNOWN_STATUS',
    `Cannot set the status of ${subject} to "${status}": this board declares ` +
      `${boardStatusKeys(config).join(', ')}.`,
  );
};

const refuseDisabledType = (config: BoardConfig, subject: string, type: TaskType): void => {
  if (isEnabledTaskType(config, type)) return;
  throw new BoardOpError(
    'UNKNOWN_TYPE',
    `Cannot set the type of ${subject} to "${type}": this board enables ` +
      `${enabledTaskTypeKeys(config).join(', ')}.`,
  );
};

// The WIP limit caps how many tasks may sit in one middle column of the current
// release — each column against the same number, independently. Everything the
// rule needs is the destination container, the config and the column in question:
// the container is the current release, so its own tasks are the count. A board
// already over its limit is valid — the rule only blocks *entering* a column, it
// never relocates or rewrites anything.
export const wipLimitFor = (
  container: Container,
  config: BoardConfig,
  status: TaskStatus,
): number | null => {
  if (!isCurrentRelease(container)) return null;
  if (!isMiddleStatus(config, status)) return null;
  return config.wipLimits?.[WIP_LIMIT_KEY] ?? null;
};

export const statusCount = (container: Container, status: TaskStatus): number =>
  container.tasks.filter((t) => t.frontmatter.status === status).length;

export const isWipLimitReached = (
  container: Container,
  config: BoardConfig,
  status: TaskStatus,
): boolean => {
  const limit = wipLimitFor(container, config, status);
  return limit !== null && statusCount(container, status) >= limit;
};

// Refuses an operation that would put a task into a full middle column of the
// current release. `wasHere` tells an entry from a reorder or a no-op: a task
// already in the column does not enter it again.
const refuseIfWipLimitReached = (
  container: Container,
  config: BoardConfig,
  subject: string,
  newStatus: TaskStatus,
  wasHere: boolean,
): void => {
  if (wasHere) return;
  const limit = wipLimitFor(container, config, newStatus);
  if (limit === null) return;
  const count = statusCount(container, newStatus);
  if (count < limit) return;
  throw new BoardOpError(
    'WIP_LIMIT',
    `Cannot put ${subject} into ${newStatus}: ${describeContainer(container)} already has ` +
      `${count} ${count === 1 ? 'task' : 'tasks'} in the ${newStatus} column and the board's ` +
      `WIP limit is ${limit}.`,
  );
};

const ORDER_STEP = 100;

const WINDOWS_FORBIDDEN_CHARS = '<>:"/\\|?*';
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// A character no filename may hold on some OS the board travels to through git.
export const isForbiddenFilenameChar = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return code < 32 || code === 127 || WINDOWS_FORBIDDEN_CHARS.includes(ch);
};

export const isWindowsReservedName = (name: string): boolean =>
  WINDOWS_RESERVED_NAMES.has(name.toUpperCase());

const shouldReplaceWithDash = (ch: string): boolean => ch === ' ' || isForbiddenFilenameChar(ch);

export const sanitizeFilenameForFs = (input: string): string => {
  let out = '';
  for (const ch of input) {
    out += shouldReplaceWithDash(ch) ? '-' : ch;
  }
  out = out.toLowerCase();
  out = out.replace(/-+/g, '-');
  out = out.replace(/^[-.]+/, '').replace(/[-. ]+$/, '');
  if (out.length === 0) return '';
  if (isWindowsReservedName(out)) out = `${out}_`;
  return out;
};

export interface NewReleaseInput {
  name: string;
  description?: string;
}

export const releaseFilenameForSlug = (slug: string): string =>
  `${RELEASES_DIR}/${slug}.md`;

export const createRelease = (
  existing: readonly Release[],
  input: NewReleaseInput,
): Release => {
  const name = input.name.trim();
  if (name.length === 0) throw new Error('Release name is required');

  const slug = sanitizeFilenameForFs(name);
  if (slug.length === 0) {
    throw new Error(
      'Release name does not contain any characters allowed in a filename',
    );
  }

  const slugLower = slug.toLowerCase();
  const conflict = existing.find((r) => r.slug.toLowerCase() === slugLower);
  if (conflict !== undefined) {
    throw new Error(`Release already exists: ${conflict.slug}`);
  }

  const description = input.description?.trim();
  return {
    filename: releaseFilenameForSlug(slug),
    slug,
    frontmatter: {
      status: 'future',
      name,
      ...(description !== undefined && description.length > 0
        ? { description }
        : {}),
    },
    preamble: '',
    tasks: [],
  };
};

export interface NewEpicInput {
  name: string;
  description?: string;
  color: string;
}

export const epicFilenameForSlug = (slug: string): string =>
  `${EPICS_DIR}/${slug}.md`;

// Chosen so a name of this length still fits on one line inside a board card's
// epic badge. Enforced when a name is written, never when one is read: an epic
// file already carrying a longer name keeps loading and is clipped on display.
export const EPIC_NAME_MAX_LENGTH = 28;

// The one name rule, shared by create, edit, the CLI and the epic dialog's
// inline editor, so the field and the file can never disagree about which names
// are refused or about the words used to refuse one. Counts the trimmed name.
export const validateEpicName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Epic name is required';
  if (trimmed.length > EPIC_NAME_MAX_LENGTH) {
    return `Epic name must be at most ${EPIC_NAME_MAX_LENGTH} characters (got ${trimmed.length}).`;
  }
  return null;
};

// An older build kept epic-less backlog tasks in `epics/no_epic.md`, so an epic
// by that slug would read as that file and be converted away by the next write.
export const RESERVED_EPIC_SLUG = 'no_epic';

export const isReservedEpicSlug = (slug: string): boolean =>
  slug.toLowerCase() === RESERVED_EPIC_SLUG;

export const createEpic = (
  existing: readonly Epic[],
  input: NewEpicInput,
): Epic => {
  const name = input.name.trim();
  const invalid = validateEpicName(name);
  if (invalid !== null) throw new Error(invalid);

  const slug = sanitizeFilenameForFs(name);
  if (slug.length === 0) {
    throw new Error(
      'Epic name does not contain any characters allowed in a filename',
    );
  }

  if (isReservedEpicSlug(slug)) {
    throw new Error(`\`${RESERVED_EPIC_SLUG}\` is a reserved name.`);
  }

  const slugLower = slug.toLowerCase();
  const conflict = existing.find((e) => e.slug.toLowerCase() === slugLower);
  if (conflict !== undefined) {
    throw new Error(`Epic already exists: ${conflict.slug}`);
  }

  const description = input.description?.trim() ?? '';
  return {
    filename: epicFilenameForSlug(slug),
    slug,
    frontmatter: {
      name,
      color: input.color,
    },
    preamble: description,
  };
};

export interface ReleasePatch {
  name?: string;
  description?: string;
}

// The file name follows the name: a rename re-derives the slug the way
// createRelease derives it, so the caller gets back a release whose `filename`
// says where it now belongs. A slug that comes out unchanged leaves the path
// alone, and callers compare paths to decide between a write and a move.
export const editRelease = (
  release: Release,
  config: BoardConfig,
  patch: ReleasePatch,
  existing: readonly Release[],
): Release => {
  if (isFrozenRelease(release, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot edit a finished release');
  }

  const frontmatter = { ...release.frontmatter };
  let slug = release.slug;

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) throw new Error('Release name is required');
    frontmatter.name = name;

    const nextSlug = sanitizeFilenameForFs(name);
    // Compared case-insensitively: a slug that differs only in case is the same
    // file on Windows and macOS, so moving to it would collide with itself.
    if (nextSlug.toLowerCase() !== release.slug.toLowerCase()) {
      if (nextSlug.length === 0) {
        throw new Error(
          'Release name does not contain any characters allowed in a filename',
        );
      }
      const nextSlugLower = nextSlug.toLowerCase();
      const conflict = existing.find(
        (r) =>
          r.filename !== release.filename &&
          r.slug.toLowerCase() === nextSlugLower,
      );
      if (conflict !== undefined) {
        throw new Error(`Release already exists: ${conflict.slug}`);
      }
      slug = nextSlug;
    }
  }

  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (description.length === 0) delete frontmatter.description;
    else frontmatter.description = description;
  }

  return {
    ...release,
    slug,
    filename: releaseFilenameForSlug(slug),
    frontmatter,
  };
};

export const setReleaseStatus = (
  release: Release,
  status: ReleaseStatus,
): Release => ({
  ...release,
  frontmatter: { ...release.frontmatter, status },
});

export const startRelease = (
  release: Release,
  existing: readonly Release[],
  config: BoardConfig,
): Release => {
  if (release.frontmatter.status !== 'future') {
    throw new Error('Only a future release can be started');
  }
  // The setting gates a new start only. Releases already active stay active when
  // it is turned off, so the board on disk is never brought in line with it.
  if (config.multipleActiveReleases !== true) {
    const current = existing.find(
      (r) => r.frontmatter.status === 'current' && r.filename !== release.filename,
    );
    if (current !== undefined) {
      throw new Error(
        `Another release is already active: ${current.frontmatter.name ?? current.slug}`,
      );
    }
  }
  return setReleaseStatus(release, 'current');
};

const findTask = (tasks: Task[], taskId: string): Task => {
  const task = tasks.find((t) => t.frontmatter.id === taskId);
  if (task === undefined) throw new Error(`Task not found: ${taskId}`);
  return task;
};

const replaceTasks = <C extends Container>(container: C, tasks: Task[]): C => ({
  ...container,
  tasks,
});

const sortByOrder = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => a.frontmatter.order - b.frontmatter.order);

interface PlaceArgs {
  status: TaskStatus;
  beforeTaskId: string | null;
}

/**
 * Computes where a task lands and returns the container's tasks **in the order
 * they came in**, with `order` (and the moved task's `status`) rewritten. The
 * array's order is the file's block order, so re-sorting it here would move task
 * sections around inside the markdown — turning a status change on a branch into
 * a delete-and-reinsert diff that conflicts with every other branch. Readers sort
 * by `order` themselves.
 */
const placeTaskInContainer = (
  tasks: Task[],
  movingId: string,
  args: PlaceArgs,
): Task[] => {
  const moving = findTask(tasks, movingId);
  const others = tasks.filter((t) => t.frontmatter.id !== movingId);
  const siblings = sortByOrder(others);

  let insertIdx: number;
  if (args.beforeTaskId === null) {
    insertIdx = siblings.length;
  } else {
    const found = siblings.findIndex((t) => t.frontmatter.id === args.beforeTaskId);
    insertIdx = found === -1 ? siblings.length : found;
  }

  let newOrder: number;
  let needsRenumber = false;

  if (siblings.length === 0) {
    newOrder = ORDER_STEP;
  } else if (insertIdx === 0) {
    newOrder = siblings[0]!.frontmatter.order - ORDER_STEP;
    if (newOrder <= 0) {
      newOrder = 0;
      needsRenumber = true;
    }
  } else if (insertIdx === siblings.length) {
    newOrder = siblings[siblings.length - 1]!.frontmatter.order + ORDER_STEP;
  } else {
    const prev = siblings[insertIdx - 1]!;
    const next = siblings[insertIdx]!;
    const candidate = Math.floor((prev.frontmatter.order + next.frontmatter.order) / 2);
    if (candidate === prev.frontmatter.order || candidate === next.frontmatter.order) {
      newOrder = 0;
      needsRenumber = true;
    } else {
      newOrder = candidate;
    }
  }

  const withMovingApplied = (task: Task, order: number): Task =>
    task.frontmatter.id === movingId
      ? { ...task, frontmatter: { ...task.frontmatter, status: args.status, order } }
      : order === task.frontmatter.order
        ? task
        : { ...task, frontmatter: { ...task.frontmatter, order } };

  if (!needsRenumber) {
    return tasks.map((t) =>
      t.frontmatter.id === movingId ? withMovingApplied(t, newOrder) : t,
    );
  }

  // The gap between two peers collapsed, so every task gets a fresh order taken
  // from its place in the visual order — while the blocks stay where they are.
  const visual = [
    ...siblings.slice(0, insertIdx),
    moving,
    ...siblings.slice(insertIdx),
  ];
  const renumbered = new Map(
    visual.map((t, i) => [t.frontmatter.id, (i + 1) * ORDER_STEP] as const),
  );
  return tasks.map((t) =>
    withMovingApplied(t, renumbered.get(t.frontmatter.id) ?? t.frontmatter.order),
  );
};

const lastOrderInContainer = (tasks: Task[]): number => {
  if (tasks.length === 0) return 0;
  return Math.max(...tasks.map((t) => t.frontmatter.order));
};

export interface NewTaskInput {
  title: string;
  type: TaskType;
  priority?: TaskPriority;
  status: TaskStatus;
  description?: string;
  epic?: string;
  custom?: Record<string, string>;
  checklist?: ChecklistItem[];
  labels?: string[];
}

const refuseInvalidLabels = (labels: readonly string[]): void => {
  for (const label of labels) {
    const invalid = validateLabel(label);
    if (invalid !== null) throw new Error(invalid);
  }
};

// Rebuilds the bag in the config's declaration order, so the on-disk key order
// never depends on the order edits arrived in. An empty value clears the key,
// and a key the config no longer declares is dropped.
const applyCustomValues = (
  current: Record<string, string> | undefined,
  patch: Record<string, string> | undefined,
  fields: readonly CustomField[],
): Record<string, string> | undefined => {
  const next: Record<string, string> = {};
  for (const field of fields) {
    const incoming = patch?.[field.key];
    const value = (incoming ?? current?.[field.key] ?? '').trim();
    if (value !== '') next[field.key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

export const createTask = <C extends Container>(
  container: C,
  config: BoardConfig,
  input: NewTaskInput,
): { container: C; config: BoardConfig; task: Task } => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot create a task in a finished release');
  }
  refuseDisabledType(config, 'a new task', input.type);
  refuseUndeclaredStatus(config, 'a new task', input.status);
  // A new task has no status to preserve, so outside the current release the only
  // status it may start with is the board's initial one — unless the lock is lifted.
  if (input.status !== initialStatus(config) && isStatusChangeLocked(container, config)) {
    throw new BoardOpError(
      'STATUS_LOCKED',
      `Cannot create a task with status "${input.status}" in ${describeContainer(container)}. ` +
        "A task's status can only be changed in the current release.",
    );
  }
  refuseIfWipLimitReached(container, config, 'a new task', input.status, false);
  const { id, config: nextConfig } = nextTaskId(config);
  const order = lastOrderInContainer(container.tasks) + ORDER_STEP;
  const custom = applyCustomValues(undefined, input.custom, config.customFields ?? []);
  const checklist =
    input.checklist !== undefined && input.checklist.length > 0 ? input.checklist : undefined;
  const labels = addLabels([], input.labels ?? [], config.labels);
  refuseInvalidLabels(labels);
  const task: Task = {
    title: input.title,
    description: input.description ?? '',
    frontmatter: {
      id,
      type: input.type,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      status: input.status,
      ...(input.epic !== undefined ? { epic: input.epic } : {}),
      order,
      ...(custom !== undefined ? { custom } : {}),
      ...(checklist !== undefined ? { checklist } : {}),
      ...(labels.length > 0 ? { labels } : {}),
    },
  };
  return {
    container: replaceTasks(container, [...container.tasks, task]),
    config: withLabelsInRegistry(nextConfig, labels),
    task,
  };
};

export interface TaskPatch {
  title?: string;
  description?: string;
  epic?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  checklist?: ChecklistItem[];
  notes?: Note[];
  // Only the keys present are touched; an empty value clears one.
  custom?: Record<string, string>;
}

export const editTask = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  patch: TaskPatch,
): C => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot edit a task in a finished release');
  }
  const current = findTask(container.tasks, taskId);
  if (patch.type !== undefined && patch.type !== current.frontmatter.type) {
    refuseDisabledType(config, taskId, patch.type);
  }
  if (patch.status !== undefined && patch.status !== current.frontmatter.status) {
    refuseUndeclaredStatus(config, taskId, patch.status);
  }
  if (patch.status !== undefined && isStatusChangeLocked(container, config)) {
    refuseStatusChange(container, taskId);
  }
  if (patch.status !== undefined) {
    refuseIfWipLimitReached(
      container,
      config,
      taskId,
      patch.status,
      current.frontmatter.status === patch.status,
    );
  }
  const workingTasks =
    patch.status !== undefined && patch.status !== current.frontmatter.status
      ? placeTaskInContainer(container.tasks, taskId, {
          status: patch.status,
          beforeTaskId: null,
        })
      : container.tasks;

  const tasks = workingTasks.map((t) => {
    if (t.frontmatter.id !== taskId) return t;
    const nextFrontmatter = { ...t.frontmatter };
    if (patch.epic === null) {
      delete nextFrontmatter.epic;
    } else if (patch.epic !== undefined) {
      nextFrontmatter.epic = patch.epic;
    }
    if (patch.type !== undefined) {
      nextFrontmatter.type = patch.type;
    }
    // No special case for the default: setting `medium` writes `medium`.
    if (patch.priority !== undefined) {
      nextFrontmatter.priority = patch.priority;
    }
    if (patch.checklist !== undefined) {
      if (patch.checklist.length === 0) {
        delete nextFrontmatter.checklist;
      } else {
        nextFrontmatter.checklist = patch.checklist;
      }
    }
    if (patch.notes !== undefined) {
      if (patch.notes.length === 0) {
        delete nextFrontmatter.notes;
      } else {
        nextFrontmatter.notes = patch.notes;
      }
    }
    const custom = applyCustomValues(
      nextFrontmatter.custom,
      patch.custom,
      config.customFields ?? [],
    );
    if (custom === undefined) {
      delete nextFrontmatter.custom;
    } else {
      nextFrontmatter.custom = custom;
    }
    return {
      ...t,
      title: patch.title ?? t.title,
      description: patch.description ?? t.description,
      frontmatter: nextFrontmatter,
    };
  });
  return replaceTasks(container, tasks);
};

// The whole next list, in the order it is to be stored. A label the task already
// carries keeps its own spelling and escapes the label rule, so a hand-edited one
// survives the write; only the labels this adds are checked, take the registry's
// spelling, and are appended to the registry when it lacks them.
export const setTaskLabels = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  labels: readonly string[],
): { container: C; config: BoardConfig } => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot edit a task in a finished release');
  }
  const current = findTask(container.tasks, taskId).frontmatter.labels ?? [];
  const next: string[] = [];
  const added: string[] = [];
  for (const raw of labels) {
    const carried = findLabel(current, raw);
    const label = carried ?? resolveLabel(config.labels, raw);
    if (hasLabel(next, label)) continue;
    next.push(label);
    if (carried === undefined) added.push(label);
  }
  refuseInvalidLabels(added);
  const tasks = container.tasks.map((t) => {
    if (t.frontmatter.id !== taskId) return t;
    const frontmatter = { ...t.frontmatter };
    if (next.length === 0) delete frontmatter.labels;
    else frontmatter.labels = next;
    return { ...t, frontmatter };
  });
  return {
    container: replaceTasks(container, tasks),
    config: withLabelsInRegistry(config, added),
  };
};

export interface EpicPatch {
  name?: string;
  preamble?: string;
  color?: string;
}

export const editEpic = (epic: Epic, patch: EpicPatch): Epic => {
  let name = epic.frontmatter.name;
  // Only a name actually being written is checked, so an epic whose stored name
  // predates the limit can still have its color or description edited.
  if (patch.name !== undefined) {
    const invalid = validateEpicName(patch.name);
    if (invalid !== null) throw new Error(invalid);
    name = patch.name.trim();
  }

  return {
    ...epic,
    preamble: patch.preamble ?? epic.preamble,
    frontmatter: {
      ...epic.frontmatter,
      name,
      color: patch.color ?? epic.frontmatter.color,
    },
  };
};

export const deleteTask = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
): C => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot delete a task in a finished release');
  }
  return replaceTasks(
    container,
    container.tasks.filter((t) => t.frontmatter.id !== taskId),
  );
};

export const changeTaskStatus = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  newStatus: TaskStatus,
): C => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot change the status of a task in a finished release');
  }
  const previousStatus = findTask(container.tasks, taskId).frontmatter.status;
  if (newStatus !== previousStatus) {
    refuseUndeclaredStatus(config, taskId, newStatus);
  }
  if (isStatusChangeLocked(container, config)) {
    refuseStatusChange(container, taskId);
  }
  refuseIfWipLimitReached(container, config, taskId, newStatus, previousStatus === newStatus);
  return replaceTasks(
    container,
    placeTaskInContainer(container.tasks, taskId, {
      status: newStatus,
      beforeTaskId: null,
    }),
  );
};

export const reorderTask = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  beforeTaskId: string | null,
): C => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot reorder a task in a finished release');
  }
  const task = findTask(container.tasks, taskId);
  return replaceTasks(
    container,
    placeTaskInContainer(container.tasks, taskId, {
      status: task.frontmatter.status,
      beforeTaskId,
    }),
  );
};

export const moveTaskInContainer = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  args: { status: TaskStatus; beforeTaskId: string | null },
): C => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task in a finished release');
  }
  const currentStatus = findTask(container.tasks, taskId).frontmatter.status;
  // This op carries a status incidentally — a reorder within a column passes the
  // one the task already has — so only an actual change is refused.
  if (args.status !== currentStatus) {
    refuseUndeclaredStatus(config, taskId, args.status);
    if (isStatusChangeLocked(container, config)) {
      refuseStatusChange(container, taskId);
    }
  }
  refuseIfWipLimitReached(container, config, taskId, args.status, currentStatus === args.status);
  return replaceTasks(container, placeTaskInContainer(container.tasks, taskId, args));
};

export interface MoveAcrossArgs {
  newStatus: TaskStatus;
  beforeTaskId: string | null;
}

// A moved task keeps its `epic` key wherever it lands: every container stores it
// the same way, and one naming no epic file is the user's to fix, not the move's.
export const moveTaskBetweenContainers = <S extends Container, D extends Container>(
  source: S,
  dest: D,
  config: BoardConfig,
  taskId: string,
  args: MoveAcrossArgs,
): { source: S; dest: D } => {
  if (isFrozenRelease(source, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task out of a finished release');
  }
  if (isFrozenRelease(dest, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task into a finished release');
  }
  const task = findTask(source.tasks, taskId);
  // Relocation preserves the status, so it never trips the lock. When a caller does
  // change it, the destination is what decides — that is where the status lands.
  if (args.newStatus !== task.frontmatter.status) {
    refuseUndeclaredStatus(config, taskId, args.newStatus);
    if (isStatusChangeLocked(dest, config)) {
      refuseStatusChange(dest, taskId);
    }
  }
  // The task is arriving from elsewhere, so it is always entering the destination's
  // column — carrying a middle status into a full current release counts.
  refuseIfWipLimitReached(dest, config, taskId, args.newStatus, false);
  const updated: Task = {
    ...task,
    frontmatter: { ...task.frontmatter, status: args.newStatus },
  };
  const newSource = replaceTasks(
    source,
    source.tasks.filter((t) => t.frontmatter.id !== taskId),
  );
  // Appended, deliberately: the end of the file is the only insertion point that
  // leaves every existing block untouched.
  const destWithTask = replaceTasks(dest, [...dest.tasks, updated]);
  const placed = placeTaskInContainer(destWithTask.tasks, taskId, {
    status: args.newStatus,
    beforeTaskId: args.beforeTaskId,
  });
  return {
    source: newSource,
    dest: replaceTasks(destWithTask, placed),
  };
};

export interface TaskLinkResult<S extends Container, D extends Container> {
  source: S;
  target: D;
  // Only the containers whose tasks actually changed, so an idempotent add or a
  // one-sided remove does not rewrite an untouched file.
  changedFilenames: string[];
}

const taskWithLink = (task: Task, link: TaskLink): Task => {
  const links = task.frontmatter.links ?? [];
  if (links.some((l) => l.type === link.type && l.to === link.to)) return task;
  return { ...task, frontmatter: { ...task.frontmatter, links: [...links, link] } };
};

const taskWithoutLink = (task: Task, link: TaskLink): Task => {
  const links = task.frontmatter.links;
  if (links === undefined) return task;
  const remaining = links.filter((l) => !(l.type === link.type && l.to === link.to));
  if (remaining.length === links.length) return task;
  const frontmatter = { ...task.frontmatter };
  if (remaining.length === 0) delete frontmatter.links;
  else frontmatter.links = remaining;
  return { ...task, frontmatter };
};

const mapTask = <C extends Container>(
  container: C,
  taskId: string,
  edit: (task: Task) => Task,
): { container: C; changed: boolean } => {
  let changed = false;
  const tasks = container.tasks.map((t) => {
    if (t.frontmatter.id !== taskId) return t;
    const next = edit(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed
    ? { container: replaceTasks(container, tasks), changed }
    : { container, changed };
};

// Edits each side of a pair and reports the files that actually changed. Every link
// operation is this shape, so the same-file aliasing lives here once: the second
// edit must see the result of the first, or one of the two mirrored records is lost.
const applyPairEdit = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  edit: (task: Task, otherTaskId: string) => Task,
): TaskLinkResult<S, D> => {
  if (source.filename === target.filename) {
    // Source and target are the same container, so the cast restates what the
    // caller passed.
    const first = mapTask(source, sourceTaskId, (t) => edit(t, targetTaskId));
    const second = mapTask(first.container, targetTaskId, (t) => edit(t, sourceTaskId));
    const merged = second.container;
    return {
      source: merged,
      target: merged as unknown as D,
      changedFilenames: first.changed || second.changed ? [source.filename] : [],
    };
  }

  const nextSource = mapTask(source, sourceTaskId, (t) => edit(t, targetTaskId));
  const nextTarget = mapTask(target, targetTaskId, (t) => edit(t, sourceTaskId));
  const changedFilenames: string[] = [];
  if (nextSource.changed) changedFilenames.push(source.filename);
  if (nextTarget.changed) changedFilenames.push(target.filename);
  return {
    source: nextSource.container,
    target: nextTarget.container,
    changedFilenames,
  };
};

// The mirrored form: the subject gets the relation, the object its inverse.
const applyLinkPair = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType,
  edit: (task: Task, link: TaskLink) => Task,
): TaskLinkResult<S, D> =>
  applyPairEdit(source, target, sourceTaskId, targetTaskId, (task, otherTaskId) =>
    edit(task, {
      type: otherTaskId === targetTaskId ? type : LINK_TYPE_META[type].inverse,
      to: otherTaskId,
    }),
  );

const taskWithoutLinksTo = (task: Task, targetId: string): Task => {
  const links = task.frontmatter.links;
  if (links === undefined) return task;
  const remaining = links.filter((l) => l.to !== targetId);
  if (remaining.length === links.length) return task;
  const frontmatter = { ...task.frontmatter };
  if (remaining.length === 0) delete frontmatter.links;
  else frontmatter.links = remaining;
  return { ...task, frontmatter };
};

// The relation is a required argument on every op below: `relates` is the product's
// fallback, not the ops', and an omitted argument must never be what clears a whole
// pair (see removeAllTaskLinks).
const assertLinkableTasks = (
  source: Container,
  target: Container,
  sourceTaskId: string,
  targetTaskId: string,
  verb: string,
): void => {
  if (sourceTaskId === targetTaskId) {
    throw new Error(`Cannot ${verb} a task to itself`);
  }
  findTask(source.tasks, sourceTaskId);
  findTask(target.tasks, targetTaskId);
};

export const addTaskLink = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType,
): TaskLinkResult<S, D> => {
  assertLinkableTasks(source, target, sourceTaskId, targetTaskId, 'link');
  return applyLinkPair(source, target, sourceTaskId, targetTaskId, type, taskWithLink);
};

export const removeTaskLink = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType,
): TaskLinkResult<S, D> => {
  assertLinkableTasks(source, target, sourceTaskId, targetTaskId, 'unlink');
  return applyLinkPair(source, target, sourceTaskId, targetTaskId, type, taskWithoutLink);
};

// Drops every relation between the two tasks at once, whatever their types — what
// `task link rm` without `--type` means. The per-task edit is the one task deletion
// already uses to strip records pointing at a removed id.
export const removeAllTaskLinks = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
): TaskLinkResult<S, D> => {
  assertLinkableTasks(source, target, sourceTaskId, targetTaskId, 'unlink');
  return applyPairEdit(source, target, sourceTaskId, targetTaskId, taskWithoutLinksTo);
};

export interface CreateTaskWithLinksResult {
  // Same order as the containers handed in, so the caller can put them back.
  containers: Container[];
  config: BoardConfig;
  task: Task;
  changedFilenames: string[];
}

// A new task and its links are one write: the task lands in the container named by
// `targetFilename`, and each link is mirrored into its other task wherever that one
// sits. Every link target is checked before anything changes, so a refusal leaves
// no half-made task behind for the caller to write.
export const createTaskWithLinks = (
  containers: readonly Container[],
  targetFilename: string,
  config: BoardConfig,
  input: NewTaskInput,
  links: readonly TaskLink[],
): CreateTaskWithLinksResult => {
  const targetIndex = containers.findIndex((c) => c.filename === targetFilename);
  const target = containers[targetIndex];
  if (target === undefined) throw new Error(`Container not found: ${targetFilename}`);
  const indexOfTask = (list: readonly Container[], taskId: string): number =>
    list.findIndex((c) => c.tasks.some((t) => t.frontmatter.id === taskId));
  for (const link of links) {
    if (indexOfTask(containers, link.to) === -1) throw new Error(`Task not found: ${link.to}`);
  }

  const created = createTask(target, config, input);
  const id = created.task.frontmatter.id;
  const next = [...containers];
  next[targetIndex] = created.container;
  const changed = new Set<string>([targetFilename]);

  for (const link of links) {
    const otherIndex = indexOfTask(next, link.to);
    // The target was checked above, and adding a link never removes a task.
    const result: TaskLinkResult<Container, Container> = addTaskLink(
      next[targetIndex],
      next[otherIndex]!,
      id,
      link.to,
      link.type,
    );
    next[targetIndex] = result.source;
    next[otherIndex] = result.target;
    for (const filename of result.changedFilenames) changed.add(filename);
  }

  return {
    containers: next,
    config: created.config,
    task: findTask(next[targetIndex].tasks, id),
    changedFilenames: [...changed],
  };
};

export interface DeleteTaskResult {
  // Same order as the containers handed in, so the caller can put them back.
  containers: Container[];
  changedFilenames: string[];
  // The task's attachments folder, deleted with it whatever it holds by then.
  unversionedRemoves: string[];
}

// Deleting a task also has to clear the mirrored link records pointing at it, or
// the surviving tasks keep dangling `links` entries. A live deletion walks every
// container, finished releases included. Deleting an archived task is still refused.
export const deleteTaskWithLinks = (
  containers: readonly Container[],
  config: BoardConfig,
  taskId: string,
): DeleteTaskResult => {
  const owner = containers.find((c) =>
    c.tasks.some((t) => t.frontmatter.id === taskId),
  );
  if (owner === undefined) throw new Error(`Task not found: ${taskId}`);
  if (isFrozenRelease(owner, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot delete a task in a finished release');
  }

  const changedFilenames: string[] = [owner.filename];
  const stripLinks = <C extends Container>(container: C): C | null => {
    const tasks = container.tasks.map((t) => taskWithoutLinksTo(t, taskId));
    const changed = tasks.some((t, i) => t !== container.tasks[i]);
    return changed ? replaceTasks(container, tasks) : null;
  };

  const next = containers.map((container) => {
    if (container === owner) {
      // A sibling task in the same file can hold the mirrored record too, and the
      // file is rewritten anyway — clean it in the same pass.
      const withoutTask = deleteTask(container, config, taskId);
      return stripLinks(withoutTask) ?? withoutTask;
    }
    const cleaned = stripLinks(container);
    if (cleaned === null) return container;
    changedFilenames.push(container.filename);
    return cleaned;
  });

  return { containers: next, changedFilenames, unversionedRemoves: [attachmentsDir(taskId)] };
};

// The Backlog as containers: `backlog.md`, plus any old-layout file the loader
// had to leave in place. Its order is one list across them.
export interface BacklogContainers {
  backlog: Backlog | null;
  heldBack: Backlog[];
}

export interface BacklogReorderResult extends BacklogContainers {
  changedFilenames: string[];
}

interface BacklogTaskLocation {
  container: Backlog;
  task: Task;
}

const backlogContainerList = (containers: BacklogContainers): Backlog[] => [
  ...(containers.backlog ? [containers.backlog] : []),
  ...containers.heldBack,
];

const locateBacklogTask = (
  containers: BacklogContainers,
  taskId: string,
): BacklogTaskLocation | null => {
  for (const container of backlogContainerList(containers)) {
    const task = container.tasks.find((t) => t.frontmatter.id === taskId);
    if (task) return { container, task };
  }
  return null;
};

type FlatBacklogEntry = { containerFilename: string; task: Task };

const flattenBacklog = (containers: BacklogContainers): FlatBacklogEntry[] => {
  const flat: FlatBacklogEntry[] = [];
  for (const container of backlogContainerList(containers)) {
    for (const task of container.tasks) flat.push({ containerFilename: container.filename, task });
  }
  return flat.sort((a, b) => a.task.frontmatter.order - b.task.frontmatter.order);
};

const writeOrder = (task: Task, order: number): Task => ({
  ...task,
  frontmatter: { ...task.frontmatter, order },
});

const applyOrderMap = (
  containers: BacklogContainers,
  orderById: Map<string, number>,
): BacklogReorderResult => {
  const changedFilenames = new Set<string>();
  const remap = (container: Backlog): Backlog => {
    let changed = false;
    const nextTasks = container.tasks.map((t) => {
      const target = orderById.get(t.frontmatter.id);
      if (target === undefined || target === t.frontmatter.order) return t;
      changed = true;
      return writeOrder(t, target);
    });
    if (!changed) return container;
    changedFilenames.add(container.filename);
    return replaceTasks(container, nextTasks);
  };
  return {
    backlog: containers.backlog ? remap(containers.backlog) : null,
    heldBack: containers.heldBack.map(remap),
    changedFilenames: [...changedFilenames],
  };
};

const buildSequentialOrderMap = (entries: FlatBacklogEntry[]): Map<string, number> => {
  const map = new Map<string, number>();
  entries.forEach((entry, i) => {
    map.set(entry.task.frontmatter.id, (i + 1) * ORDER_STEP);
  });
  return map;
};

export const reorderTaskInBacklog = (
  containers: BacklogContainers,
  taskId: string,
  beforeTaskId: string | null,
): BacklogReorderResult => {
  const location = locateBacklogTask(containers, taskId);
  if (location === null) throw new Error(`Task not found in backlog: ${taskId}`);

  const others = flattenBacklog(containers).filter(
    (e) => e.task.frontmatter.id !== taskId,
  );

  let insertIdx: number;
  if (beforeTaskId === null) {
    insertIdx = others.length;
  } else {
    const found = others.findIndex((e) => e.task.frontmatter.id === beforeTaskId);
    insertIdx = found === -1 ? others.length : found;
  }

  let newOrder = 0;
  let needsRenumber = false;
  if (others.length === 0) {
    newOrder = ORDER_STEP;
  } else if (insertIdx === 0) {
    const candidate = others[0]!.task.frontmatter.order - ORDER_STEP;
    if (candidate <= 0) needsRenumber = true;
    else newOrder = candidate;
  } else if (insertIdx === others.length) {
    newOrder = others[others.length - 1]!.task.frontmatter.order + ORDER_STEP;
  } else {
    const prev = others[insertIdx - 1]!.task.frontmatter.order;
    const next = others[insertIdx]!.task.frontmatter.order;
    const candidate = Math.floor((prev + next) / 2);
    if (candidate === prev || candidate === next) needsRenumber = true;
    else newOrder = candidate;
  }

  if (needsRenumber) {
    const insertedEntry: FlatBacklogEntry = {
      containerFilename: location.container.filename,
      task: location.task,
    };
    const finalOrder = [
      ...others.slice(0, insertIdx),
      insertedEntry,
      ...others.slice(insertIdx),
    ];
    return applyOrderMap(containers, buildSequentialOrderMap(finalOrder));
  }

  return applyOrderMap(containers, new Map([[taskId, newOrder]]));
};

export interface CompleteReleaseContainers {
  release: Release;
  config: BoardConfig;
  backlog: Backlog;
  // When set, all unfinished tasks move into this release; otherwise they go to
  // the backlog, each with its `epic` key as it was.
  targetRelease: Release | null;
}

export interface CompleteReleaseResult {
  release: Release;
  targetRelease: Release | null;
  backlog: Backlog;
  changedFilenames: string[];
}

export const completeRelease = (
  input: CompleteReleaseContainers,
): CompleteReleaseResult => {
  if (input.release.frontmatter.status !== 'current') {
    throw new Error('Only an active release can be completed');
  }
  const done = terminalStatus(input.config);
  const unfinished = input.release.tasks
    .filter((t) => t.frontmatter.status !== done)
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order);

  let release = input.release;
  let targetRelease = input.targetRelease;
  let backlog = input.backlog;
  const changedFilenames = new Set<string>([release.filename]);

  for (const task of unfinished) {
    const taskId = task.frontmatter.id;
    const args = { newStatus: task.frontmatter.status, beforeTaskId: null };

    if (targetRelease !== null) {
      const moved = moveTaskBetweenContainers(release, targetRelease, input.config, taskId, args);
      release = moved.source;
      targetRelease = moved.dest;
      changedFilenames.add(targetRelease.filename);
      continue;
    }

    const moved = moveTaskBetweenContainers(release, backlog, input.config, taskId, args);
    release = moved.source;
    backlog = moved.dest;
    changedFilenames.add(backlog.filename);
  }

  return {
    release: setReleaseStatus(release, 'finished'),
    targetRelease,
    backlog,
    changedFilenames: [...changedFilenames],
  };
};
