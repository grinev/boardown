import type { BoardSnapshot, Release } from '@boardown/core';

export const findReleaseOfTask = (
  snapshot: BoardSnapshot,
  taskId: string,
): Release | undefined => {
  for (const release of snapshot.releases) {
    if (release.tasks.some((t) => t.frontmatter.id === taskId)) return release;
  }
  return undefined;
};
