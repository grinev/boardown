import type { BoardSnapshot, Task } from '@boardown/core';

const ID_SUFFIX = /-(\d+)$/;

const idOrder = (id: string): number => {
  const match = ID_SUFFIX.exec(id);
  if (match === null) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

// A task belongs to an epic by its own `epic` key, wherever it sits.
export const findTasksByEpic = (snapshot: BoardSnapshot, slug: string): Task[] => {
  const containers = [
    ...snapshot.releases,
    ...(snapshot.backlog ? [snapshot.backlog] : []),
    ...snapshot.heldBack,
  ];
  const out: Task[] = [];
  for (const container of containers) {
    for (const task of container.tasks) {
      if (task.frontmatter.epic === slug) out.push(task);
    }
  }
  out.sort((a, b) => idOrder(a.frontmatter.id) - idOrder(b.frontmatter.id));
  return out;
};
