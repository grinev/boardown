import type { Task } from '@boardown/core';

/**
 * The compact projection of a task used everywhere a task appears in a *list* —
 * the fields the UI's task card carries, plus its status. Full detail is what
 * `task get` is for.
 */
export interface TaskSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  epic?: string;
  checklist?: { done: number; total: number };
  notes?: number;
}

export const statusMark = (task: Task): string => {
  switch (task.frontmatter.status) {
    case 'todo':
      return '○';
    case 'in-progress':
      return '◐';
    case 'done':
      return '●';
  }
};

export function taskSummary(task: Task): TaskSummary {
  const { id, type, status, epic, checklist, notes } = task.frontmatter;
  return {
    id,
    title: task.title,
    type,
    status,
    ...(epic !== undefined && epic !== '' ? { epic } : {}),
    ...(checklist !== undefined && checklist.length > 0
      ? {
          checklist: {
            done: checklist.filter((item) => item.done).length,
            total: checklist.length,
          },
        }
      : {}),
    ...(notes !== undefined && notes.length > 0 ? { notes: notes.length } : {}),
  };
}

export const summarizeTasks = (tasks: readonly Task[]): TaskSummary[] =>
  tasks.map(taskSummary);

/** One task as a line of a list: the shared human counterpart of `taskSummary`. */
export function summaryLine(task: Task, indent = '  '): string {
  const s = taskSummary(task);
  const parts = [
    `${indent}${statusMark(task)} ${s.id}`,
    s.title,
    `[${s.type}/${s.status}]`,
  ];
  if (s.epic !== undefined) parts.push(`epic:${s.epic}`);
  if (s.checklist !== undefined) parts.push(`☑${s.checklist.done}/${s.checklist.total}`);
  if (s.notes !== undefined) parts.push(`✎${s.notes}`);
  return parts.join('  ');
}

export const summaryLines = (tasks: readonly Task[], indent = '  '): string[] =>
  tasks.map((task) => summaryLine(task, indent));

/** Shared by every listing command: `--full` means "one level deeper". */
export const isFull = (flags: Record<string, string | boolean>): boolean =>
  flags.full === true;

/** A list payload: summaries by default, whole tasks under `--full`. */
export const taskPayload = (
  tasks: readonly Task[],
  full: boolean,
): TaskSummary[] | Task[] => (full ? [...tasks] : summarizeTasks(tasks));
