import yaml from 'js-yaml';
import type { Backlog, Epic, Release, Task, TaskFrontmatter } from './schemas.js';

const FENCE = '---';

const dumpYaml = (data: object): string =>
  yaml
    .dump(data, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' })
    .replace(/\n+$/, '');

interface TaskFmOptions {
  omitEpic?: boolean;
}

const orderedTaskFrontmatter = (
  fm: TaskFrontmatter,
  options: TaskFmOptions = {},
): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: fm.id,
    type: fm.type,
    status: fm.status,
  };
  if (!options.omitEpic && fm.epic !== undefined) out.epic = fm.epic;
  out.order = fm.order;
  if (fm.checklist && fm.checklist.length > 0) {
    out.checklist = fm.checklist.map((it) => ({
      id: it.id,
      text: it.text,
      done: it.done,
    }));
  }
  return out;
};

const serializeTask = (task: Task, options: TaskFmOptions = {}): string => {
  const fmBlock = `${FENCE}\n${dumpYaml(orderedTaskFrontmatter(task.frontmatter, options))}\n${FENCE}`;
  const desc = task.description.trim();
  const body = desc === '' ? '' : `\n\n${desc}`;
  return `## ${task.title}\n\n${fmBlock}${body}`;
};

const buildFile = (
  fileFrontmatter: object,
  preamble: string,
  tasks: Task[],
  options: TaskFmOptions = {},
): string => {
  const fmBlock = `${FENCE}\n${dumpYaml(fileFrontmatter)}\n${FENCE}`;
  const sections: string[] = [fmBlock];
  const trimmedPreamble = preamble.trim();
  if (trimmedPreamble !== '') sections.push(trimmedPreamble);
  for (const task of tasks) sections.push(serializeTask(task, options));
  return `${sections.join('\n\n')}\n`;
};

export const serializeRelease = (release: Release): string => {
  const fm: Record<string, unknown> = {
    status: release.frontmatter.status,
  };
  if (release.frontmatter.name !== undefined) fm.name = release.frontmatter.name;
  if (release.frontmatter.description !== undefined) fm.description = release.frontmatter.description;
  if (release.frontmatter.startDate !== undefined) fm.startDate = release.frontmatter.startDate;
  if (release.frontmatter.endDate !== undefined) fm.endDate = release.frontmatter.endDate;
  return buildFile(fm, release.preamble, release.tasks);
};

export const serializeEpic = (epic: Epic): string => {
  const fm: Record<string, unknown> = {
    name: epic.frontmatter.name,
    color: epic.frontmatter.color,
  };
  return buildFile(fm, epic.preamble, epic.tasks, { omitEpic: true });
};

export const serializeBacklog = (backlog: Backlog): string =>
  buildFile({}, backlog.preamble, backlog.tasks, { omitEpic: true });
