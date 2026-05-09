import type { BoardSnapshot, Task } from '@boardown/core';

export const findTaskById = (snapshot: BoardSnapshot, id: string): Task | null => {
  for (const release of snapshot.releases) {
    for (const task of release.tasks) {
      if (task.frontmatter.id === id) return task;
    }
  }
  for (const epic of snapshot.epics) {
    for (const task of epic.tasks) {
      if (task.frontmatter.id === id) return task;
    }
  }
  return null;
};
