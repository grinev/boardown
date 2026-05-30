import type { BoardSnapshot, Task } from '@boardown/core';

const ID_SUFFIX = /-(\d+)$/;

const idOrder = (id: string): number => {
  const match = ID_SUFFIX.exec(id);
  if (match === null) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

export const findTasksByEpic = (snapshot: BoardSnapshot, slug: string): Task[] => {
  const out: Task[] = [];
  for (const release of snapshot.releases) {
    for (const task of release.tasks) {
      if (task.frontmatter.epic === slug) out.push(task);
    }
  }
  // Tasks in epics/<slug>.md belong to the epic by virtue of their file; the
  // epic frontmatter field is irrelevant here (filename is authoritative).
  for (const epic of snapshot.epics) {
    if (epic.slug !== slug) continue;
    for (const task of epic.tasks) {
      out.push(task);
    }
  }
  out.sort((a, b) => idOrder(a.frontmatter.id) - idOrder(b.frontmatter.id));
  return out;
};
