import { nextTaskId } from './id-generator.js';
import type {
  BoardConfig,
  Epic,
  Release,
  Task,
  TaskStatus,
  TaskType,
} from './schemas.js';

export const DEFAULT_EPIC_SLUG = 'no-epic';

export const RELEASES_DIR = 'releases';

export type Container = Release | Epic;

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

const placeTaskInColumn = (
  tasks: Task[],
  movingId: string,
  args: PlaceArgs,
): Task[] => {
  const moving = findTask(tasks, movingId);
  const others = tasks.filter((t) => t.frontmatter.id !== movingId);
  const column = sortByOrder(
    others.filter((t) => t.frontmatter.status === args.status),
  );

  let insertIdx: number;
  if (args.beforeTaskId === null) {
    insertIdx = column.length;
  } else {
    const found = column.findIndex((t) => t.frontmatter.id === args.beforeTaskId);
    insertIdx = found === -1 ? column.length : found;
  }

  let newOrder: number;
  let needsRenumber = false;

  if (column.length === 0) {
    newOrder = ORDER_STEP;
  } else if (insertIdx === 0) {
    newOrder = column[0]!.frontmatter.order - ORDER_STEP;
    if (newOrder <= 0) {
      newOrder = 0;
      needsRenumber = true;
    }
  } else if (insertIdx === column.length) {
    newOrder = column[column.length - 1]!.frontmatter.order + ORDER_STEP;
  } else {
    const prev = column[insertIdx - 1]!;
    const next = column[insertIdx]!;
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

  const newColumn = [
    ...column.slice(0, insertIdx),
    updatedMoving,
    ...column.slice(insertIdx),
  ];

  const finalColumn = needsRenumber
    ? newColumn.map((t, i) => ({
        ...t,
        frontmatter: { ...t.frontmatter, order: (i + 1) * ORDER_STEP },
      }))
    : newColumn;

  const otherTasks = others.filter((t) => t.frontmatter.status !== args.status);
  return [...otherTasks, ...finalColumn];
};

const lastOrderForStatus = (tasks: Task[], status: TaskStatus): number => {
  const orders = tasks
    .filter((t) => t.frontmatter.status === status)
    .map((t) => t.frontmatter.order);
  if (orders.length === 0) return 0;
  return Math.max(...orders);
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
  const order = lastOrderForStatus(container.tasks, input.status) + ORDER_STEP;
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
      ? placeTaskInColumn(container.tasks, taskId, {
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
    placeTaskInColumn(container.tasks, taskId, {
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
    placeTaskInColumn(container.tasks, taskId, {
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
  replaceTasks(container, placeTaskInColumn(container.tasks, taskId, args));

export interface MoveAcrossArgs {
  newStatus: TaskStatus;
  beforeTaskId: string | null;
}

export const moveTaskBetweenContainers = <S extends Container, D extends Container>(
  source: S,
  dest: D,
  taskId: string,
  args: MoveAcrossArgs,
): { source: S; dest: D } => {
  const task = findTask(source.tasks, taskId);
  const updated: Task = {
    ...task,
    frontmatter: { ...task.frontmatter, status: args.newStatus },
  };
  const newSource = replaceTasks(
    source,
    source.tasks.filter((t) => t.frontmatter.id !== taskId),
  );
  const destWithTask = replaceTasks(dest, [...dest.tasks, updated]);
  const placed = placeTaskInColumn(destWithTask.tasks, taskId, {
    status: args.newStatus,
    beforeTaskId: args.beforeTaskId,
  });
  return {
    source: newSource,
    dest: replaceTasks(destWithTask, placed),
  };
};
