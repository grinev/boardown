import { serializeTask } from './serializer.js';
import type { BoardConfig, Task } from './schemas.js';

// Absent means on. Every reader — the dialog, the Settings checkbox, the CLI —
// resolves it here, so a board that never touched the setting cannot read as off
// in one place and on in another.
export const isUpdateTracked = (config: BoardConfig): boolean => config.trackUpdatedAt !== false;

// ISO 8601 UTC with milliseconds — the form a note's `createdAt` takes.
export const currentMoment = (): string => new Date().toISOString();

export const withUpdatedAt = (task: Task, config: BoardConfig, now: string): Task =>
  isUpdateTracked(config) ? { ...task, frontmatter: { ...task.frontmatter, updatedAt: now } } : task;

// What a change is: whatever the task's block on disk would show, except where it
// sits in its column and the stamps themselves. Comparing the rendering rather than
// field by field means a key added to the task later counts without anyone
// remembering to list it, and a save the serializer would write identically is no
// change at all.
const contentOf = (task: Task): string => {
  const { createdAt, updatedAt, ...frontmatter } = task.frontmatter;
  return serializeTask({ ...task, frontmatter: { ...frontmatter, order: 0 } });
};

const unchanged = (previous: readonly Task[], next: readonly Task[]): boolean =>
  previous.length === next.length &&
  next.every((task, i) => {
    const before = previous[i];
    return (
      before !== undefined &&
      (task === before || serializeTask(task) === serializeTask(before))
    );
  });

// The tasks of `next` stamped against what the same container held before: a task
// whose content changed, or that was not there, gets `updatedAt`; one whose `order`
// alone moved does not. When nothing changed at all — order included — the previous
// list itself comes back, which is how an op tells a caller there is nothing to write.
export const stampChangedTasks = (
  previous: Task[],
  next: Task[],
  config: BoardConfig,
  now: string,
): Task[] => {
  if (unchanged(previous, next)) return previous;
  const before = new Map(previous.map((t) => [t.frontmatter.id, t] as const));
  return next.map((task) => {
    const prior = before.get(task.frontmatter.id);
    if (prior === task) return task;
    if (prior !== undefined && contentOf(prior) === contentOf(task)) return task;
    return withUpdatedAt(task, config, now);
  });
};
