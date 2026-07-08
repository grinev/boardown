import type { BoardSnapshot, Release, Task } from '@boardown/core';
import { loadBoardOrThrow, resolveBoardRoot } from '../persistence';
import type { CommandHandler } from '../types';

export const boardCommand: CommandHandler = async (_args, ctx) => {
  const root = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  const { snapshot, problems } = await loadBoardOrThrow(root);
  return {
    data: {
      config: snapshot.config,
      releases: snapshot.releases,
      epics: snapshot.epics,
      backlog: snapshot.backlog,
    },
    human: renderBoard(snapshot),
    ...(problems.length > 0 ? { problems } : {}),
  };
};

export const statusMark = (task: Task): string => {
  switch (task.frontmatter.status) {
    case 'todo':
      return '○';
    case 'in-progress':
      return '◐';
    case 'done':
      return '●';
  }
};

const renderTasks = (lines: string[], tasks: readonly Task[]): void => {
  for (const task of tasks) {
    lines.push(`  ${statusMark(task)} ${task.frontmatter.id}  ${task.title}`);
  }
};

const renderReleases = (lines: string[], releases: readonly Release[]): void => {
  for (const release of releases) {
    const name = release.frontmatter.name ?? release.slug;
    lines.push(`\n[${release.frontmatter.status}] ${name}  (${release.filename})`);
    renderTasks(lines, release.tasks);
  }
};

function renderBoard(snapshot: BoardSnapshot): string {
  const lines: string[] = [`${snapshot.config.projectName} — board`];

  renderReleases(
    lines,
    snapshot.releases.filter((r) => r.frontmatter.status === 'current'),
  );
  renderReleases(
    lines,
    snapshot.releases.filter((r) => r.frontmatter.status === 'future'),
  );

  if (snapshot.backlog && snapshot.backlog.tasks.length > 0) {
    lines.push('\nBacklog');
    renderTasks(lines, snapshot.backlog.tasks);
  }

  for (const epic of snapshot.epics) {
    lines.push(`\nEpic: ${epic.frontmatter.name}  (${epic.slug})`);
    renderTasks(lines, epic.tasks);
  }

  renderReleases(
    lines,
    snapshot.releases.filter((r) => r.frontmatter.status === 'finished'),
  );

  if (snapshot.problems.length > 0) {
    lines.push(`\n${snapshot.problems.length} problem(s) — run with --json for details.`);
  }

  return lines.join('\n');
}
