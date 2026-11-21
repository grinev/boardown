import type { BoardSnapshot } from './loader.js';
import type { ParseProblem } from './problems.js';
import type { Backlog, Release, Task } from './schemas.js';

export interface TaskCopy {
  title: string;
  file: string;
  taskIndex: number;
}

export interface DuplicateTaskIds {
  id: string;
  copies: TaskCopy[];
}

export interface TaskOccurrence extends TaskCopy {
  task: Task;
  container: Release | Backlog;
  index: number;
}

const sources = new WeakMap<
  Task,
  { block: string; file: string; index: number; preserve?: boolean }
>();

export const recordTaskSource = (task: Task, block: string, file: string, index: number): void => {
  sources.set(task, { block, file, index });
};

export const taskListKey = (task: Task): string => {
  const source = sources.get(task);
  return source?.preserve
    ? `${task.frontmatter.id}:${source.file}:${source.index}`
    : task.frontmatter.id;
};

export const inheritTaskSource = (before: Task, after: Task): Task => {
  const source = sources.get(before);
  if (source) sources.set(after, source);
  return after;
};

export const preserveTaskBlock = (task: Task, preserve = true): void => {
  const source = sources.get(task);
  if (source) source.preserve = preserve;
};

export const preservedTaskBlock = (task: Task): string | undefined => {
  const source = sources.get(task);
  return source?.preserve ? source.block : undefined;
};

export const originalTaskBlock = (task: Task, file: string): string | undefined => {
  const source = sources.get(task);
  return source?.file === file ? source.block : undefined;
};

export const taskContainers = (snapshot: BoardSnapshot): (Release | Backlog)[] => [
  ...snapshot.releases,
  ...(snapshot.backlog ? [snapshot.backlog] : []),
  ...snapshot.heldBack,
];

export const taskOccurrences = (
  snapshot: BoardSnapshot,
  sourceOf: (task: Task) => string | undefined = () => undefined,
): Map<string, TaskOccurrence[]> => {
  const occurrences = new Map<string, TaskOccurrence[]>();
  for (const container of taskContainers(snapshot)) {
    for (const [index, task] of container.tasks.entries()) {
      const id = task.frontmatter.id;
      const copy = {
        task,
        container,
        index,
        title: task.title,
        file: sourceOf(task) ?? container.filename,
        taskIndex: sources.get(task)?.index ?? index,
      };
      const group = occurrences.get(id);
      if (group) group.push(copy);
      else occurrences.set(id, [copy]);
    }
  }
  return occurrences;
};

export const duplicateTaskProblem = (id: string, copies: readonly TaskCopy[]): ParseProblem => {
  const locations = copies.map(({ title, file, taskIndex }) => ({ title, file, taskIndex }));
  return {
    level: 'warning',
    scope: 'task',
    taskId: id,
    file: locations[0]?.file ?? '',
    message: `Duplicate task ID ${id}: ${locations.map(({ title, file, taskIndex }) => `"${title}" (${file}, task block ${taskIndex + 1})`).join('; ')}`,
    duplicateTaskIds: { id, copies: locations },
  };
};

export const collectDuplicateProblems = (
  snapshot: BoardSnapshot,
  sourceOf?: (task: Task) => string | undefined,
): ParseProblem[] => {
  const problems: ParseProblem[] = [];
  for (const [id, copies] of taskOccurrences(snapshot, sourceOf)) {
    for (const { task } of copies) preserveTaskBlock(task, copies.length > 1);
    if (copies.length < 2) continue;
    problems.push(duplicateTaskProblem(id, copies));
  }
  return problems;
};

export const duplicateTaskIds = (
  snapshot: BoardSnapshot,
  id: string,
): DuplicateTaskIds | undefined =>
  snapshot.problems.find((p) => p.duplicateTaskIds?.id === id)?.duplicateTaskIds;

export const isDuplicateTaskId = (snapshot: BoardSnapshot | null, id: string): boolean =>
  snapshot !== null && duplicateTaskIds(snapshot, id) !== undefined;

export const ambiguousTaskMessage = (id: string): string =>
  `Task ID ${id} is ambiguous. Repair duplicate IDs before acting on it.`;
