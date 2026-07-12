import { LINK_TYPE_META, type BoardSnapshot, type LinkType, type Task } from '@boardown/core';
import { findReleaseOfTask } from './find-release-of-task';

export interface LinkedTaskRow {
  task: Task;
  type: LinkType;
  // The other task lives in a finished release: the link cannot be removed,
  // because that would rewrite an archived file.
  archived: boolean;
}

const allTasks = (snapshot: BoardSnapshot): Task[] => [
  ...snapshot.releases.flatMap((r) => r.tasks),
  ...snapshot.epics.flatMap((e) => e.tasks),
  ...(snapshot.backlog?.tasks ?? []),
];

export const isTaskArchived = (snapshot: BoardSnapshot, taskId: string): boolean =>
  findReleaseOfTask(snapshot, taskId)?.frontmatter.status === 'finished';

// The rows shown in a task's Linked tasks section: its own link records plus the
// records other tasks point at it with (mapped through the type's inverse, so an
// asymmetric type reads correctly from this side). Links are mirrored on write, so
// the union normally agrees with itself; taking it anyway keeps a half-written
// link — a hand-edited file — visible and removable instead of silently gone.
// A record whose target is not on the board is dropped: nothing to show.
export const collectLinkedTasks = (
  snapshot: BoardSnapshot,
  taskId: string,
): LinkedTaskRow[] => {
  const tasks = allTasks(snapshot);
  const self = tasks.find((t) => t.frontmatter.id === taskId);
  if (self === undefined) return [];

  const seen = new Set<string>();
  const rows: LinkedTaskRow[] = [];

  const push = (type: LinkType, otherId: string): void => {
    const key = `${type}:${otherId}`;
    if (seen.has(key)) return;
    const other = tasks.find((t) => t.frontmatter.id === otherId);
    if (other === undefined) return;
    seen.add(key);
    rows.push({
      task: other,
      type,
      archived: isTaskArchived(snapshot, otherId),
    });
  };

  for (const link of self.frontmatter.links ?? []) {
    push(link.type, link.to);
  }
  // Incoming records come from wherever their task happens to live, so sort them
  // by id rather than exposing the container traversal order.
  const incoming = tasks
    .filter(
      (other) =>
        other.frontmatter.id !== taskId &&
        (other.frontmatter.links ?? []).some((l) => l.to === taskId),
    )
    .sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
  for (const other of incoming) {
    for (const link of other.frontmatter.links ?? []) {
      if (link.to !== taskId) continue;
      push(LINK_TYPE_META[link.type].inverse, other.frontmatter.id);
    }
  }

  return rows;
};
