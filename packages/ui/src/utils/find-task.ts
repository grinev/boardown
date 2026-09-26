import type { BoardSnapshot, Task } from '@boardown/core';

export const findTaskById = (snapshot: BoardSnapshot, id: string): Task | null => {
  const containers = [
    ...snapshot.releases,
    ...(snapshot.backlog ? [snapshot.backlog] : []),
    ...snapshot.heldBack,
  ];
  for (const container of containers) {
    for (const task of container.tasks) {
      if (task.frontmatter.id === id) return task;
    }
  }
  return null;
};
