import yaml from 'js-yaml';
import type { Backlog, DocPage, Epic, Release, Task, TaskFrontmatter } from './schemas.js';

const FENCE = '---';

const dumpYaml = (data: object): string =>
  yaml
    .dump(data, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' })
    .replace(/\n+$/, '');

const orderedTaskFrontmatter = (fm: TaskFrontmatter): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: fm.id,
    type: fm.type,
  };
  // Absent stays absent — the default is never synthesised into a file.
  if (fm.priority !== undefined) out.priority = fm.priority;
  out.status = fm.status;
  if (fm.epic !== undefined) out.epic = fm.epic;
  out.order = fm.order;
  if (fm.checklist && fm.checklist.length > 0) {
    out.checklist = fm.checklist.map((it) => ({
      id: it.id,
      text: it.text,
      done: it.done,
    }));
  }
  if (fm.notes && fm.notes.length > 0) {
    out.notes = fm.notes.map((note) => ({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
    }));
  }
  if (fm.links && fm.links.length > 0) {
    out.links = fm.links.map((link) => ({ type: link.type, to: link.to }));
  }
  if (fm.labels && fm.labels.length > 0) {
    out.labels = [...fm.labels];
  }
  // Custom values are flat on disk. The bag is already in declaration order —
  // board-ops owns that — so this only spreads it out.
  if (fm.custom) {
    for (const [key, value] of Object.entries(fm.custom)) {
      if (value !== '') out[key] = value;
    }
  }
  return out;
};

const serializeTask = (task: Task): string => {
  const fmBlock = `${FENCE}\n${dumpYaml(orderedTaskFrontmatter(task.frontmatter))}\n${FENCE}`;
  const desc = task.description.trim();
  const body = desc === '' ? '' : `\n\n${desc}`;
  return `## ${task.title}\n\n${fmBlock}${body}`;
};

// A container file: an optional frontmatter block, the text above the first task,
// then each task in the array's order — which is the file's block order.
const buildFile = (fileFrontmatter: object | null, preamble: string, tasks: Task[]): string => {
  const sections: string[] = [];
  if (fileFrontmatter !== null) sections.push(`${FENCE}\n${dumpYaml(fileFrontmatter)}\n${FENCE}`);
  const trimmedPreamble = preamble.trim();
  if (trimmedPreamble !== '') sections.push(trimmedPreamble);
  for (const task of tasks) sections.push(serializeTask(task));
  return sections.length === 0 ? '' : `${sections.join('\n\n')}\n`;
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

// An epic file is the epic's frontmatter and description. Its tasks live in the
// backlog or a release, each naming it in its own `epic` key.
export const serializeEpic = (epic: Epic): string =>
  buildFile({ name: epic.frontmatter.name, color: epic.frontmatter.color }, epic.preamble, []);

// `backlog.md` carries no container frontmatter, and each task keeps its `epic`
// key exactly as in a release file.
export const serializeBacklog = (backlog: Backlog): string =>
  buildFile(null, backlog.preamble, backlog.tasks);

export const serializeDocPage = (page: DocPage): string => {
  const title = page.frontmatter.title;
  // Only the trailing newlines are normalised — exactly what the parser strips —
  // so serialize is the inverse of parse and saving a title never rewrites the
  // body's own whitespace.
  const body = page.body.replace(/\n+$/, '');
  // A page with no title carries no frontmatter block at all, so a hand-authored
  // page stays hand-authored after a round trip.
  if (title === undefined || title.trim() === '') {
    return body === '' ? '' : `${body}\n`;
  }
  const fmBlock = `${FENCE}\n${dumpYaml({ title })}\n${FENCE}`;
  return body === '' ? `${fmBlock}\n` : `${fmBlock}\n\n${body}\n`;
};
