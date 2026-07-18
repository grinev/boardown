import type { Release, Task } from '@boardown/core';
import {
  currentRelease,
  futureReleases,
  sortTasksByOrder,
  unscheduledTasks,
} from '@boardown/core';
import { loadBoardOrThrow, resolveBoardRoot } from '../persistence';
import { isFull, summaryLines, taskPayload } from '../summary';
import type { CommandHandler } from '../types';

interface Section {
  key: string;
  title: string;
  status: string | null;
  filename: string | null;
  tasks: Task[];
}

const releaseSection = (release: Release, status: string): Section => ({
  key: release.slug,
  title: release.frontmatter.name ?? release.slug,
  status,
  filename: release.filename,
  tasks: sortTasksByOrder(release.tasks),
});

// The Backlog tab: the current release, then each future release, then
// everything unscheduled. Epic files are not sections — their tasks belong to
// the unscheduled list, exactly as the tab shows them.
export const backlogCommand: CommandHandler = async (args, ctx) => {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { snapshot, problems } = await loadBoardOrThrow(root);
  const full = isFull(args.flags);

  const sections: Section[] = [];
  const current = currentRelease(snapshot);
  if (current) sections.push(releaseSection(current, 'current'));
  for (const release of futureReleases(snapshot)) {
    sections.push(releaseSection(release, 'future'));
  }
  sections.push({
    key: 'backlog',
    title: 'Backlog',
    status: null,
    filename: null,
    tasks: unscheduledTasks(snapshot),
  });

  return {
    data: {
      sections: sections.map((section) => ({
        key: section.key,
        title: section.title,
        status: section.status,
        filename: section.filename,
        taskCount: section.tasks.length,
        tasks: taskPayload(section.tasks, full),
      })),
    },
    human: render(snapshot.config.projectName, sections),
    ...(problems.length > 0 ? { problems } : {}),
  };
};

function render(projectName: string, sections: readonly Section[]): string {
  const lines: string[] = [`${projectName} — backlog`];
  for (const section of sections) {
    const label = section.status === null ? '' : `[${section.status}] `;
    lines.push(`\n${label}${section.title}  (${section.tasks.length})`);
    if (section.tasks.length === 0) {
      lines.push('  no tasks');
      continue;
    }
    lines.push(...summaryLines(section.tasks));
  }
  return lines.join('\n');
}
