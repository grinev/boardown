import type { StatusConfig, Task } from '@boardown/core';
import { boardStatuses, effectiveTaskPriority, statusIndex } from '@boardown/core';
import { flagBool, type ParsedArgs } from './args';

/**
 * The compact projection of a task used everywhere a task appears in a *list* —
 * the fields the UI's task card carries, plus its status. Full detail is what
 * `task get` is for.
 */
export interface TaskSummary {
  id: string;
  title: string;
  type: string;
  // Always populated: an absent key on disk reports as the default, so a caller
  // never has to know about the unset case.
  priority: string;
  status: string;
  epic?: string;
  checklist?: { done: number; total: number };
  notes?: number;
}

// Positional, like the columns themselves: the initial status is empty, the
// terminal one full, everything else — including a status the board no longer
// declares — half.
export const statusMark = (config: StatusConfig, task: Task): string => {
  const index = statusIndex(config, task.frontmatter.status);
  if (index === 0) return '○';
  if (index === boardStatuses(config).length - 1) return '●';
  return '◐';
};

export function taskSummary(task: Task): TaskSummary {
  const { id, type, status, epic, checklist, notes } = task.frontmatter;
  return {
    id,
    title: task.title,
    type,
    priority: effectiveTaskPriority(task.frontmatter),
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
export function summaryLine(config: StatusConfig, task: Task, indent = '  '): string {
  const s = taskSummary(task);
  const parts = [
    `${indent}${statusMark(config, task)} ${s.id}`,
    s.title,
    `[${s.type}/${s.priority}/${s.status}]`,
  ];
  if (s.epic !== undefined) parts.push(`epic:${s.epic}`);
  if (s.checklist !== undefined) parts.push(`☑${s.checklist.done}/${s.checklist.total}`);
  if (s.notes !== undefined) parts.push(`✎${s.notes}`);
  return parts.join('  ');
}

export const summaryLines = (
  config: StatusConfig,
  tasks: readonly Task[],
  indent = '  ',
): string[] => tasks.map((task) => summaryLine(config, task, indent));

/** Shared by every listing command: `--full` means "one level deeper". */
export const isFull = (flags: ParsedArgs['flags']): boolean => flagBool(flags, 'full');

/** A list payload: summaries by default, whole tasks under `--full`. */
export const taskPayload = (
  tasks: readonly Task[],
  full: boolean,
): TaskSummary[] | Task[] => (full ? [...tasks] : summarizeTasks(tasks));
