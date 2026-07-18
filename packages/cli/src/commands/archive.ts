import type { Release } from '@boardown/core';
import { finishedReleases, sortTasksByOrder } from '@boardown/core';
import { loadBoardOrThrow, resolveBoardRoot } from '../persistence';
import { isFull, summaryLines, summarizeTasks } from '../summary';
import type { CommandHandler } from '../types';

// The Archive tab: finished releases, newest first, collapsed — task lists only
// under --full.
export const archiveCommand: CommandHandler = async (args, ctx) => {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { snapshot, problems } = await loadBoardOrThrow(root);
  const full = isFull(args.flags);
  const releases = finishedReleases(snapshot);

  return {
    data: {
      releases: releases.map((release) => ({
        slug: release.slug,
        name: release.frontmatter.name ?? release.slug,
        status: release.frontmatter.status,
        taskCount: release.tasks.length,
        ...(full ? { tasks: summarizeTasks(sortTasksByOrder(release.tasks)) } : {}),
      })),
    },
    human: render(snapshot.config.projectName, releases, full),
    ...(problems.length > 0 ? { problems } : {}),
  };
};

function render(projectName: string, releases: readonly Release[], full: boolean): string {
  if (releases.length === 0) return `${projectName} — archive\n\nNo finished releases.`;

  const lines: string[] = [`${projectName} — archive`];
  for (const release of releases) {
    const name = release.frontmatter.name ?? release.slug;
    lines.push(`\n[finished] ${name}  (${release.tasks.length})`);
    if (full) lines.push(...summaryLines(sortTasksByOrder(release.tasks)));
  }
  return lines.join('\n');
}
