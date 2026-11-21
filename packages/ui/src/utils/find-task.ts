import { isDuplicateTaskId, taskContainers, type BoardSnapshot, type Task } from '@boardown/core';

const findTask = (snapshot: BoardSnapshot, matches: (id: string) => boolean): Task | null => {
  const containers = taskContainers(snapshot);
  let result: Task | null = null;
  for (const container of containers) {
    for (const task of container.tasks) {
      if (!matches(task.frontmatter.id)) continue;
      if (result !== null) return null;
      result = task;
    }
  }
  return result;
};

export const findTaskById = (snapshot: BoardSnapshot, id: string): Task | null =>
  isDuplicateTaskId(snapshot, id) ? null : findTask(snapshot, (taskId) => taskId === id);

// For an id typed or pasted by hand, where `bd-12` still means BD-12.
export const findTaskByIdIgnoringCase = (snapshot: BoardSnapshot, id: string): Task | null => {
  const wanted = id.toLowerCase();
  return findTask(snapshot, (taskId) => taskId.toLowerCase() === wanted);
};
