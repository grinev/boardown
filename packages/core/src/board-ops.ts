import { nextTaskId } from './id-generator.js';
import type {
  Backlog,
  BoardConfig,
  Epic,
  Release,
  ReleaseStatus,
  Task,
  TaskStatus,
  TaskType,
} from './schemas.js';

export const DEFAULT_EPIC_SLUG = 'no-epic';

export const RELEASES_DIR = 'releases';

export type Container = Release | Epic | Backlog;

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

  const updatedMoving: Task = {
    ...moving,
    frontmatter: { ...moving.frontmatter, status: args.status, order: newOrder },
  };

  const placed = [
    ...siblings.slice(0, insertIdx),
    updatedMoving,
    ...siblings.slice(insertIdx),
  ];

  return needsRenumber
    ? placed.map((t, i) => ({
        ...t,
        frontmatter: { ...t.frontmatter, order: (i + 1) * ORDER_STEP },
      }))
    : placed;
};

const lastOrderInContainer = (tasks: Task[]): number => {
  if (tasks.length === 0) return 0;
  return Math.max(...tasks.map((t) => t.frontmatter.order));
};

export interface NewTaskInput {
  title: string;
  type: TaskType;
  status: TaskStatus;
  description?: string;
  epic?: string;
}

export const createTask = <C extends Container>(
  container: C,
  config: BoardConfig,
  input: NewTaskInput,
): { container: C; config: BoardConfig; task: Task } => {
  const { id, config: nextConfig } = nextTaskId(config);
  const order = lastOrderInContainer(container.tasks) + ORDER_STEP;
  const task: Task = {
    title: input.title,
    description: input.description ?? '',
    frontmatter: {
      id,
      type: input.type,
      status: input.status,
      ...(input.epic !== undefined ? { epic: input.epic } : {}),
      order,
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
  status?: TaskStatus;
}

export const editTask = <C extends Container>(
  container: C,
  taskId: string,
  patch: TaskPatch,
): C => {
  const current = findTask(container.tasks, taskId);
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
}

export const editEpic = (epic: Epic, patch: EpicPatch): Epic => ({
  ...epic,
  preamble: patch.preamble ?? epic.preamble,
  frontmatter: {
    ...epic.frontmatter,
    name: patch.name ?? epic.frontmatter.name,
  },
});

export const deleteTask = <C extends Container>(container: C, taskId: string): C =>
  replaceTasks(
    container,
    container.tasks.filter((t) => t.frontmatter.id !== taskId),
  );

export const changeTaskStatus = <C extends Container>(
  container: C,
  taskId: string,
  newStatus: TaskStatus,
): C =>
  replaceTasks(
    container,
    placeTaskInContainer(container.tasks, taskId, {
      status: newStatus,
      beforeTaskId: null,
    }),
  );

export const reorderTask = <C extends Container>(
  container: C,
  taskId: string,
  beforeTaskId: string | null,
): C => {
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
  taskId: string,
  args: { status: TaskStatus; beforeTaskId: string | null },
): C =>
  replaceTasks(container, placeTaskInContainer(container.tasks, taskId, args));

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
  taskId: string,
  args: MoveAcrossArgs,
): { source: S; dest: D } => {
  const task = findTask(source.tasks, taskId);
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
      const moved = moveTaskBetweenContainers(release, targetRelease, taskId, {
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
      const moved = moveTaskBetweenContainers(release, epics[epicIdx]!, taskId, {
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
    const moved = moveTaskBetweenContainers(release, backlog, taskId, {
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
