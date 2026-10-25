import type { BoardSnapshot, Task } from '@boardown/core';

const findTask = (snapshot: BoardSnapshot, matches: (id: string) => boolean): Task | null => {
  const containers = [
    ...snapshot.releases,
    ...(snapshot.backlog ? [snapshot.backlog] : []),
    ...snapshot.heldBack,
  ];
  for (const container of containers) {
    for (const task of container.tasks) {
      if (matches(task.frontmatter.id)) return task;
    }
  }
  return null;
};

export const findTaskById = (snapshot: BoardSnapshot, id: string): Task | null =>
  findTask(snapshot, (taskId) => taskId === id);

// For an id typed or pasted by hand, where `bd-12` still means BD-12.
export const findTaskByIdIgnoringCase = (snapshot: BoardSnapshot, id: string): Task | null => {
  const wanted = id.toLowerCase();
  return findTask(snapshot, (taskId) => taskId.toLowerCase() === wanted);
};
