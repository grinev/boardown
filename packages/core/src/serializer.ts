import yaml from 'js-yaml';
import type { Epic, Release, Task, TaskFrontmatter } from './schemas.js';

const FENCE = '---';

const dumpYaml = (data: object): string =>
  yaml
    .dump(data, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' })
    .replace(/\n+$/, '');

const orderedTaskFrontmatter = (fm: TaskFrontmatter): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: fm.id,
    status: fm.status,
  };
  if (fm.epic !== undefined) out.epic = fm.epic;
  out.order = fm.order;
  return out;
};

const serializeTask = (task: Task): string => {
  const fmBlock = `${FENCE}\n${dumpYaml(orderedTaskFrontmatter(task.frontmatter))}\n${FENCE}`;
  const desc = task.description.trim();
  const body = desc === '' ? '' : `\n\n${desc}`;
  return `## ${task.title}\n\n${fmBlock}${body}`;
};

const buildFile = (
  fileFrontmatter: object,
  preamble: string,
  tasks: Task[],
): string => {
  const fmBlock = `${FENCE}\n${dumpYaml(fileFrontmatter)}\n${FENCE}`;
  const sections: string[] = [fmBlock];
  const trimmedPreamble = preamble.trim();
  if (trimmedPreamble !== '') sections.push(trimmedPreamble);
  for (const task of tasks) sections.push(serializeTask(task));
  return `${sections.join('\n\n')}\n`;
};

export const serializeRelease = (release: Release): string => {
  const fm: Record<string, unknown> = { release: release.frontmatter.release };
  if (release.frontmatter.startDate !== undefined) fm.startDate = release.frontmatter.startDate;
  if (release.frontmatter.endDate !== undefined) fm.endDate = release.frontmatter.endDate;
  return buildFile(fm, release.preamble, release.tasks);
};

export const serializeEpic = (epic: Epic): string => {
  const fm: Record<string, unknown> = { slug: epic.frontmatter.slug };
  if (epic.frontmatter.title !== undefined) fm.title = epic.frontmatter.title;
  return buildFile(fm, epic.preamble, epic.tasks);
};
