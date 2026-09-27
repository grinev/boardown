import { isFinishedRelease, type Release } from '@boardown/core';

// A finished release is a destination only when the board lifts the freeze, and
// then its option says so: a task moved there leaves the Board and the Backlog.
export const releaseOptionLabel = (release: Release): string => {
  const name = release.frontmatter.name ?? release.slug;
  return isFinishedRelease(release) ? `${name} (finished)` : name;
};
