import { nextTaskId } from './id-generator.js';
import { LINK_TYPE_META } from './schemas.js';
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

export const BACKLOG_BASENAME = 'no_epic.md';

export const BACKLOG_PATH = `${EPICS_DIR}/${BACKLOG_BASENAME}`;

export const DOCS_DIR = 'docs';

export type Container = Release | Epic | Backlog;

// An empty backlog stand-in for boards that have no `epics/no_epic.md` yet.
// The file is written lazily the first time a task lands in the backlog.
export const emptyBacklog = (): Backlog => ({
  filename: BACKLOG_PATH,
  frontmatter: {},
  preamble: '',
  tasks: [],
});

export type BoardOpErrorCode = 'ARCHIVED' | 'STATUS_LOCKED' | 'WIP_LIMIT';

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

// A finished release is archived: the product treats its tasks as read-only and
// forbids scheduling new work into it. These invariants live here so every shell
// (UI, CLI, …) enforces them without re-implementing the rule. `status` only
// exists on a Release frontmatter, so the `in` check narrows the union safely.
const isFinishedRelease = (container: Container): boolean =>
  'status' in container.frontmatter && container.frontmatter.status === 'finished';

// A task's status only means something while its release is being worked on — the
// Board shows the current release alone. So a status may only *change* there: a
// future release, an epic file and the backlog keep whatever status a task
// arrived with and freeze it. Moving a task around never changes its status, so
// it is unaffected.
const isCurrentRelease = (container: Container): boolean =>
  'status' in container.frontmatter && container.frontmatter.status === 'current';

const describeContainer = (container: Container): string => {
  // The backlog is the one container without a slug; a release is the one whose
  // frontmatter carries a status.
  if (!('slug' in container)) return 'the backlog';
  const fm = container.frontmatter;
  if ('status' in fm) {
    return `the ${fm.status} release "${fm.name ?? container.slug}"`;
  }
  return `the epic "${fm.name}"`;
};

const refuseStatusChange = (container: Container, taskId: string): never => {
  throw new BoardOpError(
    'STATUS_LOCKED',
    `Cannot change the status of ${taskId}: it is in ${describeContainer(container)}. ` +
      "A task's status can only be changed in the current release.",
  );
};

// The WIP limit caps how many tasks may sit in the current release's In Progress
// column. Everything the rule needs is the destination container plus the config:
// the container is the current release, so its own tasks are the count. A board
// already over its limit is valid — the rule only blocks *entering* the column,
// it never relocates or rewrites anything.
export const wipLimitFor = (container: Container, config: BoardConfig): number | null => {
  if (!isCurrentRelease(container)) return null;
  return config.wipLimits?.['in-progress'] ?? null;
};

export const inProgressCount = (container: Container): number =>
  container.tasks.filter((t) => t.frontmatter.status === 'in-progress').length;

export const isWipLimitReached = (container: Container, config: BoardConfig): boolean => {
  const limit = wipLimitFor(container, config);
  return limit !== null && inProgressCount(container) >= limit;
};

// Refuses an operation that would put a task into `in-progress` in a full current
// release. `wasInProgressHere` tells an entry from a reorder or a no-op: a task
// already in the column does not enter it again.
const refuseIfWipLimitReached = (
  container: Container,
  config: BoardConfig,
  subject: string,
  newStatus: TaskStatus,
  wasInProgressHere: boolean,
): void => {
  if (newStatus !== 'in-progress' || wasInProgressHere) return;
  const limit = wipLimitFor(container, config);
  if (limit === null) return;
  const count = inProgressCount(container);
  if (count < limit) return;
  throw new BoardOpError(
    'WIP_LIMIT',
    `Cannot put ${subject} into in-progress: ${describeContainer(container)} already has ` +
      `${count} ${count === 1 ? 'task' : 'tasks'} in progress and the board's WIP limit is ${limit}.`,
  );
};

const ORDER_STEP = 100;

const WINDOWS_FORBIDDEN_CHARS = '<>:"/\\|?*';
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const shouldReplaceWithDash = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  if (code < 32 || code === 127) return true;
  if (ch === ' ') return true;
  return WINDOWS_FORBIDDEN_CHARS.includes(ch);
};

export const sanitizeFilenameForFs = (input: string): string => {
  let out = '';
  for (const ch of input) {
    out += shouldReplaceWithDash(ch) ? '-' : ch;
  }
  out = out.toLowerCase();
  out = out.replace(/-+/g, '-');
  out = out.replace(/^[-.]+/, '').replace(/[-. ]+$/, '');
  if (out.length === 0) return '';
  if (WINDOWS_RESERVED_NAMES.has(out.toUpperCase())) out = `${out}_`;
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

export const createEpic = (
  existing: readonly Epic[],
  input: NewEpicInput,
): Epic => {
  const name = input.name.trim();
  if (name.length === 0) throw new Error('Epic name is required');

  const slug = sanitizeFilenameForFs(name);
  if (slug.length === 0) {
    throw new Error(
      'Epic name does not contain any characters allowed in a filename',
    );
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
    tasks: [],
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
  patch: ReleasePatch,
  existing: readonly Release[],
): Release => {
  if (isFinishedRelease(release)) {
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
): Release => {
  if (release.frontmatter.status !== 'future') {
    throw new Error('Only a future release can be started');
  }
  const current = existing.find(
    (r) => r.frontmatter.status === 'current' && r.filename !== release.filename,
  );
  if (current !== undefined) {
    throw new Error(
      `Another release is already current: ${current.frontmatter.name ?? current.slug}`,
    );
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
}

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
  if (isFinishedRelease(container)) {
    throw new BoardOpError('ARCHIVED', 'Cannot create a task in a finished release');
  }
  // A new task has no status to preserve, so outside the current release the only
  // status it may start with is the default one.
  if (input.status !== 'todo' && !isCurrentRelease(container)) {
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
    },
  };
  return {
    container: replaceTasks(container, [...container.tasks, task]),
    config: nextConfig,
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
  if (isFinishedRelease(container)) {
    throw new BoardOpError('ARCHIVED', 'Cannot edit a task in a finished release');
  }
  if (patch.status !== undefined && !isCurrentRelease(container)) {
    refuseStatusChange(container, taskId);
  }
  const current = findTask(container.tasks, taskId);
  if (patch.status !== undefined) {
    refuseIfWipLimitReached(
      container,
      config,
      taskId,
      patch.status,
      current.frontmatter.status === 'in-progress',
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

export interface EpicPatch {
  name?: string;
  preamble?: string;
  color?: string;
}

export const editEpic = (epic: Epic, patch: EpicPatch): Epic => ({
  ...epic,
  preamble: patch.preamble ?? epic.preamble,
  frontmatter: {
    ...epic.frontmatter,
    name: patch.name ?? epic.frontmatter.name,
    color: patch.color ?? epic.frontmatter.color,
  },
});

export const deleteTask = <C extends Container>(container: C, taskId: string): C => {
  if (isFinishedRelease(container)) {
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
  if (isFinishedRelease(container)) {
    throw new BoardOpError('ARCHIVED', 'Cannot change the status of a task in a finished release');
  }
  if (!isCurrentRelease(container)) {
    refuseStatusChange(container, taskId);
  }
  refuseIfWipLimitReached(
    container,
    config,
    taskId,
    newStatus,
    findTask(container.tasks, taskId).frontmatter.status === 'in-progress',
  );
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
  taskId: string,
  beforeTaskId: string | null,
): C => {
  if (isFinishedRelease(container)) {
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
  if (isFinishedRelease(container)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task in a finished release');
  }
  const currentStatus = findTask(container.tasks, taskId).frontmatter.status;
  // This op carries a status incidentally — a reorder within a column passes the
  // one the task already has — so only an actual change is refused.
  if (args.status !== currentStatus && !isCurrentRelease(container)) {
    refuseStatusChange(container, taskId);
  }
  refuseIfWipLimitReached(
    container,
    config,
    taskId,
    args.status,
    currentStatus === 'in-progress',
  );
  return replaceTasks(container, placeTaskInContainer(container.tasks, taskId, args));
};

export type DestEpic =
  | { kind: 'preserve' }
  | { kind: 'clear' }
  | { kind: 'set'; slug: string };

export interface MoveAcrossArgs {
  newStatus: TaskStatus;
  beforeTaskId: string | null;
  destEpic?: DestEpic;
}

const applyDestEpic = (fm: Task['frontmatter'], action: DestEpic): Task['frontmatter'] => {
  switch (action.kind) {
    case 'preserve':
      return fm;
    case 'clear': {
      if (fm.epic === undefined) return fm;
      const { epic: _omit, ...rest } = fm;
      return rest;
    }
    case 'set':
      return fm.epic === action.slug ? fm : { ...fm, epic: action.slug };
  }
};

export const moveTaskBetweenContainers = <S extends Container, D extends Container>(
  source: S,
  dest: D,
  config: BoardConfig,
  taskId: string,
  args: MoveAcrossArgs,
): { source: S; dest: D } => {
  if (isFinishedRelease(source)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task out of a finished release');
  }
  if (isFinishedRelease(dest)) {
    throw new BoardOpError('ARCHIVED', 'Cannot move a task into a finished release');
  }
  const task = findTask(source.tasks, taskId);
  // Relocation preserves the status, so it never trips the lock. When a caller does
  // change it, the destination is what decides — that is where the status lands.
  if (args.newStatus !== task.frontmatter.status && !isCurrentRelease(dest)) {
    refuseStatusChange(dest, taskId);
  }
  // The task is arriving from elsewhere, so it is always entering the destination's
  // column — carrying an `in-progress` status into a full current release counts.
  refuseIfWipLimitReached(dest, config, taskId, args.newStatus, false);
  const epicAction: DestEpic = args.destEpic ?? { kind: 'preserve' };
  const updated: Task = {
    ...task,
    frontmatter: applyDestEpic(
      { ...task.frontmatter, status: args.newStatus },
      epicAction,
    ),
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

const applyLinkPair = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType,
  edit: (task: Task, link: TaskLink) => Task,
): TaskLinkResult<S, D> => {
  const forward: TaskLink = { type, to: targetTaskId };
  const backward: TaskLink = { type: LINK_TYPE_META[type].inverse, to: sourceTaskId };

  if (source.filename === target.filename) {
    // Both tasks live in the same file: the second edit must be applied to the
    // result of the first, or one of the two mirrored records is lost. Source and
    // target are the same container, so the cast restates what the caller passed.
    const first = mapTask(source, sourceTaskId, (t) => edit(t, forward));
    const second = mapTask(first.container, targetTaskId, (t) => edit(t, backward));
    const merged = second.container;
    return {
      source: merged,
      target: merged as unknown as D,
      changedFilenames: first.changed || second.changed ? [source.filename] : [],
    };
  }

  const nextSource = mapTask(source, sourceTaskId, (t) => edit(t, forward));
  const nextTarget = mapTask(target, targetTaskId, (t) => edit(t, backward));
  const changedFilenames: string[] = [];
  if (nextSource.changed) changedFilenames.push(source.filename);
  if (nextTarget.changed) changedFilenames.push(target.filename);
  return {
    source: nextSource.container,
    target: nextTarget.container,
    changedFilenames,
  };
};

// A link is mirrored into both tasks, so both files must be writable: an archived
// task is refused as the target just as much as as the source.
const assertLinkable = (source: Container, target: Container): void => {
  if (isFinishedRelease(source) || isFinishedRelease(target)) {
    throw new BoardOpError('ARCHIVED', 'Cannot change the links of a task in a finished release');
  }
};

export const addTaskLink = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType = 'relates',
): TaskLinkResult<S, D> => {
  if (sourceTaskId === targetTaskId) {
    throw new Error('Cannot link a task to itself');
  }
  assertLinkable(source, target);
  findTask(source.tasks, sourceTaskId);
  findTask(target.tasks, targetTaskId);
  return applyLinkPair(source, target, sourceTaskId, targetTaskId, type, taskWithLink);
};

export const removeTaskLink = <S extends Container, D extends Container>(
  source: S,
  target: D,
  sourceTaskId: string,
  targetTaskId: string,
  type: LinkType = 'relates',
): TaskLinkResult<S, D> => {
  if (sourceTaskId === targetTaskId) {
    throw new Error('Cannot unlink a task from itself');
  }
  assertLinkable(source, target);
  findTask(source.tasks, sourceTaskId);
  findTask(target.tasks, targetTaskId);
  return applyLinkPair(source, target, sourceTaskId, targetTaskId, type, taskWithoutLink);
};

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

export interface DeleteTaskResult {
  // Same order as the containers handed in, so the caller can put them back.
  containers: Container[];
  changedFilenames: string[];
}

// Deleting a task also has to clear the mirrored link records pointing at it, or
// the surviving tasks keep dangling `links` entries. A finished release is never
// rewritten, so a link held by an archived task is left in place — the UI hides
// it and the CLI reports it as missing.
export const deleteTaskWithLinks = (
  containers: readonly Container[],
  taskId: string,
): DeleteTaskResult => {
  const owner = containers.find((c) =>
    c.tasks.some((t) => t.frontmatter.id === taskId),
  );
  if (owner === undefined) throw new Error(`Task not found: ${taskId}`);
  if (isFinishedRelease(owner)) {
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
      const withoutTask = deleteTask(container, taskId);
      return stripLinks(withoutTask) ?? withoutTask;
    }
    if (isFinishedRelease(container)) return container;
    const cleaned = stripLinks(container);
    if (cleaned === null) return container;
    changedFilenames.push(container.filename);
    return cleaned;
  });

  return { containers: next, changedFilenames };
};

export interface BacklogContainers {
  epics: Epic[];
  backlog: Backlog | null;
}

export interface BacklogReorderResult {
  epics: Epic[];
  backlog: Backlog | null;
  changedFilenames: string[];
}

interface BacklogTaskLocation {
  container: Epic | Backlog;
  task: Task;
}

const locateBacklogTask = (
  containers: BacklogContainers,
  taskId: string,
): BacklogTaskLocation | null => {
  for (const epic of containers.epics) {
    const task = epic.tasks.find((t) => t.frontmatter.id === taskId);
    if (task) return { container: epic, task };
  }
  if (containers.backlog) {
    const task = containers.backlog.tasks.find((t) => t.frontmatter.id === taskId);
    if (task) return { container: containers.backlog, task };
  }
  return null;
};

type FlatBacklogEntry = { containerFilename: string; task: Task };

const flattenBacklog = (containers: BacklogContainers): FlatBacklogEntry[] => {
  const flat: FlatBacklogEntry[] = [];
  for (const epic of containers.epics) {
    for (const task of epic.tasks) flat.push({ containerFilename: epic.filename, task });
  }
  if (containers.backlog) {
    for (const task of containers.backlog.tasks) {
      flat.push({ containerFilename: containers.backlog.filename, task });
    }
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
  const remap = <C extends Epic | Backlog>(container: C): C => {
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
  const nextEpics = containers.epics.map(remap);
  const nextBacklog = containers.backlog ? remap(containers.backlog) : null;
  return {
    epics: nextEpics,
    backlog: nextBacklog,
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
  epics: Epic[];
  backlog: Backlog | null;
  // When set, all unfinished tasks move into this release; otherwise they go
  // back to their epic (or the backlog when they have none).
  targetRelease: Release | null;
}

export interface CompleteReleaseResult {
  release: Release;
  targetRelease: Release | null;
  epics: Epic[];
  backlog: Backlog | null;
  changedFilenames: string[];
}

export const completeRelease = (
  input: CompleteReleaseContainers,
): CompleteReleaseResult => {
  if (input.release.frontmatter.status !== 'current') {
    throw new Error('Only the current release can be completed');
  }
  const unfinished = input.release.tasks
    .filter((t) => t.frontmatter.status !== 'done')
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order);

  let release = input.release;
  let targetRelease = input.targetRelease;
  const epics = [...input.epics];
  let backlog = input.backlog;
  const changedFilenames = new Set<string>([release.filename]);

  for (const task of unfinished) {
    const taskId = task.frontmatter.id;
    const newStatus = task.frontmatter.status;

    if (targetRelease !== null) {
      const moved = moveTaskBetweenContainers(release, targetRelease, input.config, taskId, {
        newStatus,
        beforeTaskId: null,
        destEpic: { kind: 'preserve' },
      });
      release = moved.source;
      targetRelease = moved.dest;
      changedFilenames.add(targetRelease.filename);
      continue;
    }

    const epicSlug = task.frontmatter.epic;
    const epicIdx =
      epicSlug !== undefined ? epics.findIndex((e) => e.slug === epicSlug) : -1;

    if (epicIdx !== -1) {
      const moved = moveTaskBetweenContainers(release, epics[epicIdx]!, input.config, taskId, {
        newStatus,
        beforeTaskId: null,
        destEpic: { kind: 'set', slug: epics[epicIdx]!.slug },
      });
      release = moved.source;
      epics[epicIdx] = moved.dest;
      changedFilenames.add(moved.dest.filename);
      continue;
    }

    if (backlog === null) {
      throw new Error('Backlog container is missing');
    }
    const moved = moveTaskBetweenContainers(release, backlog, input.config, taskId, {
      newStatus,
      beforeTaskId: null,
      destEpic: { kind: 'clear' },
    });
    release = moved.source;
    backlog = moved.dest;
    changedFilenames.add(backlog.filename);
  }

  return {
    release: setReleaseStatus(release, 'finished'),
    targetRelease,
    epics,
    backlog,
    changedFilenames: [...changedFilenames],
  };
};
