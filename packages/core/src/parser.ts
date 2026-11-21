import yaml from 'js-yaml';
import {
  type Backlog,
  BacklogFrontmatterSchema,
  buildCustomValuesSchema,
  type CustomField,
  type DocPage,
  type DocPageFrontmatter,
  DocPageFrontmatterSchema,
  type Epic,
  EpicFrontmatterSchema,
  type Release,
  ReleaseFrontmatterSchema,
  type Task,
  type TaskFrontmatter,
  TaskFrontmatterSchema,
  TaskLabelsSchema,
} from './schemas.js';
import {
  fileProblem,
  type ParseProblem,
  type ParseResult,
  taskProblem,
} from './problems.js';
import { inheritTaskSource, recordTaskSource } from './task-ids.js';

const FRONTMATTER_FENCE = '---';
const OPENING_FENCE = `${FRONTMATTER_FENCE}\n`;
const CLOSING_FENCE = `\n${FRONTMATTER_FENCE}`;

export const fileFrontmatterPrefix = (text: string): string => {
  if (!text.startsWith(OPENING_FENCE)) return '';
  const end = text.indexOf(`${CLOSING_FENCE}\n`, FRONTMATTER_FENCE.length);
  if (end !== -1) return text.slice(0, end + CLOSING_FENCE.length);
  return text.length >= 7 && text.endsWith(CLOSING_FENCE) ? text : '';
};

// A host supplies only positional byte reads; the fence rules are the same for
// every shell. Read ahead by at most one chunk and never return the page body.
export async function readFrontmatterPrefix(
  read: (offset: number, length: number) => Promise<Uint8Array>,
  stripBom = false,
): Promise<string> {
  const decoder = new TextDecoder('utf-8', { ignoreBOM: !stripBom });
  let text = '';
  let searchFrom = FRONTMATTER_FENCE.length;
  for (let offset = 0;;) {
    const bytes = await read(offset, offset === 0 ? (stripBom ? 7 : 4) : 1024);
    if (bytes.length === 0) return fileFrontmatterPrefix(text + decoder.decode());
    offset += bytes.length;
    text += decoder.decode(bytes, { stream: true });
    if (text.length < OPENING_FENCE.length) {
      if (!OPENING_FENCE.startsWith(text)) return '';
      continue;
    }
    if (!text.startsWith(OPENING_FENCE)) return '';
    const end = text.indexOf(`${CLOSING_FENCE}\n`, searchFrom);
    if (end !== -1) return text.slice(0, end + CLOSING_FENCE.length);
    searchFrom = Math.max(searchFrom, text.length - CLOSING_FENCE.length);
  }
}

interface FileSplit {
  fileFrontmatterText: string | null;
  body: string;
}

const splitFileFrontmatter = (text: string): FileSplit => {
  const lines = text.split('\n');
  if (lines[0] !== FRONTMATTER_FENCE) {
    return { fileFrontmatterText: null, body: text };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FRONTMATTER_FENCE) {
      const yamlText = lines.slice(1, i).join('\n');
      const body = lines.slice(i + 1).join('\n').replace(/^\n+/, '');
      return { fileFrontmatterText: yamlText, body };
    }
  }
  return { fileFrontmatterText: null, body: text };
};

interface RawTaskSegment {
  title: string;
  yamlText: string;
  description: string;
  block: string;
}

interface BodySplit {
  preamble: string;
  segments: RawTaskSegment[];
}

// A task section is a `## ` heading followed, past blank lines, by a closed
// frontmatter block. The one rule, shared by the body splitter and by the cut
// that keeps a file's text above its first task.
const findTaskStarts = (lines: readonly string[], from = 0): number[] => {
  const taskStarts: number[] = [];
  for (let i = from; i < lines.length; i++) {
    if (!lines[i]!.startsWith('## ')) continue;
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === '') j++;
    if (lines[j] !== FRONTMATTER_FENCE) continue;
    let k = j + 1;
    let foundClose = false;
    while (k < lines.length) {
      if (lines[k] === FRONTMATTER_FENCE) {
        foundClose = true;
        break;
      }
      k++;
    }
    if (!foundClose) continue;
    taskStarts.push(i);
  }
  return taskStarts;
};

// A container file's text above its first task section, byte for byte, without
// the blank lines that separated it from that task. Null when the file holds no
// task section at all.
export const textAboveFirstTask = (text: string): string | null => {
  const lines = text.split('\n');
  let bodyStart = 0;
  if (lines[0] === FRONTMATTER_FENCE) {
    const close = lines.indexOf(FRONTMATTER_FENCE, 1);
    if (close !== -1) bodyStart = close + 1;
  }
  const first = findTaskStarts(lines, bodyStart)[0];
  if (first === undefined) return null;
  return `${lines.slice(0, first).join('\n').replace(/\n+$/, '')}\n`;
};

const splitBody = (body: string): BodySplit => {
  const lines = body.split('\n');
  const taskStarts = findTaskStarts(lines);

  if (taskStarts.length === 0) {
    return { preamble: body, segments: [] };
  }

  const preambleLines = lines.slice(0, taskStarts[0]);
  const preamble = preambleLines.join('\n').replace(/\n+$/, '');

  const segments: RawTaskSegment[] = [];
  for (let s = 0; s < taskStarts.length; s++) {
    const start = taskStarts[s]!;
    const end = s + 1 < taskStarts.length ? taskStarts[s + 1]! : lines.length;
    const headerLine = lines[start]!;
    const title = headerLine.slice(3).trim();

    let j = start + 1;
    while (j < end && lines[j]!.trim() === '') j++;
    const yamlOpen = j;
    let k = yamlOpen + 1;
    while (k < end && lines[k] !== FRONTMATTER_FENCE) k++;
    const yamlText = lines.slice(yamlOpen + 1, k).join('\n');
    const descLines = lines.slice(k + 1, end);
    const description = descLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');

    const block = lines.slice(start, end).join('\n') + (end < lines.length ? '\n' : '');
    segments.push({ title, yamlText, description, block });
  }

  return { preamble, segments };
};

const parseYaml = (text: string): unknown => {
  const value = yaml.load(text);
  return value ?? {};
};

const parseTasks = (
  segments: RawTaskSegment[],
  filename: string,
  customFields: readonly CustomField[],
): { tasks: Task[]; problems: ParseProblem[] } => {
  const tasks: Task[] = [];
  const problems: ParseProblem[] = [];
  const customSchema =
    customFields.length > 0 ? buildCustomValuesSchema(customFields) : null;

  segments.forEach((segment, index) => {
    if (segment.title === '') {
      problems.push(taskProblem(filename, index, 'Task heading is empty.'));
      return;
    }

    let rawData: unknown;
    try {
      rawData = parseYaml(segment.yamlText);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(taskProblem(filename, index, `Invalid task frontmatter YAML: ${message}`));
      return;
    }

    const result = TaskFrontmatterSchema.safeParse(rawData);
    if (!result.success) {
      const idCandidate =
        rawData && typeof rawData === 'object' && 'id' in rawData && typeof rawData.id === 'string'
          ? rawData.id
          : undefined;
      problems.push(
        taskProblem(
          filename,
          index,
          `Task frontmatter failed validation: ${result.error.issues.map((i) => i.message).join('; ')}`,
          idCandidate,
        ),
      );
      return;
    }

    const frontmatter: TaskFrontmatter = result.data;
    if (customSchema !== null) {
      const customResult = customSchema.safeParse(rawData);
      if (!customResult.success) {
        problems.push(
          taskProblem(
            filename,
            index,
            `Task custom fields failed validation: ${customResult.error.issues.map((i) => i.message).join('; ')}`,
            result.data.id,
          ),
        );
        return;
      }
      // Declaration order, so the on-disk key order never depends on edit order.
      const custom: Record<string, string> = {};
      for (const field of customFields) {
        const value = customResult.data[field.key];
        if (value !== undefined && value !== '') custom[field.key] = value;
      }
      if (Object.keys(custom).length > 0) frontmatter.custom = custom;
    }

    // Unlike the keys above, a malformed list costs only itself: the task loads
    // without it, and the error-level problem keeps its file from being written
    // back without the value.
    const rawLabels =
      rawData !== null && typeof rawData === 'object' && 'labels' in rawData
        ? rawData.labels
        : undefined;
    if (rawLabels !== undefined) {
      const labelsResult = TaskLabelsSchema.safeParse(rawLabels);
      if (labelsResult.success) {
        if (labelsResult.data.length > 0) frontmatter.labels = labelsResult.data;
      } else {
        problems.push(
          taskProblem(
            filename,
            index,
            'Task labels failed validation: expected a list of strings.',
            frontmatter.id,
          ),
        );
      }
    }

    const task = {
      title: segment.title,
      description: segment.description,
      frontmatter,
    };
    recordTaskSource(task, segment.block, filename, index);
    tasks.push(task);
  });

  return { tasks, problems };
};

export const parseRelease = (
  text: string,
  filename: string,
  slug: string,
  customFields: readonly CustomField[] = [],
): ParseResult<Release> => {
  const problems: ParseProblem[] = [];
  const { fileFrontmatterText, body } = splitFileFrontmatter(text);

  if (fileFrontmatterText === null) {
    problems.push(fileProblem(filename, 'Missing file frontmatter block.'));
    return { value: null, problems };
  }

  let rawFm: unknown;
  try {
    rawFm = parseYaml(fileFrontmatterText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    problems.push(fileProblem(filename, `Invalid file frontmatter YAML: ${message}`));
    return { value: null, problems };
  }

  const fmResult = ReleaseFrontmatterSchema.safeParse(rawFm);
  if (!fmResult.success) {
    problems.push(
      fileProblem(
        filename,
        `Release frontmatter failed validation: ${fmResult.error.issues.map((i) => i.message).join('; ')}`,
      ),
    );
    return { value: null, problems };
  }

  const { preamble, segments } = splitBody(body);
  const { tasks, problems: taskProblems } = parseTasks(segments, filename, customFields);
  problems.push(...taskProblems);

  return {
    value: {
      filename,
      slug,
      frontmatter: fmResult.data,
      preamble,
      tasks,
    },
    problems,
  };
};

const withEpicOnTask = (task: Task, slug: string): Task =>
  task.frontmatter.epic === slug
    ? task
    : inheritTaskSource(task, { ...task, frontmatter: { ...task.frontmatter, epic: slug } });

export const parseLegacyTasks = (
  text: string,
  filename: string,
  customFields: readonly CustomField[],
): Task[] => parseTasks(splitBody(splitFileFrontmatter(text).body).segments, filename, customFields).tasks;

export const parseBacklog = (
  text: string,
  filename: string,
  customFields: readonly CustomField[] = [],
): ParseResult<Backlog> => {
  const problems: ParseProblem[] = [];
  const { fileFrontmatterText, body } = splitFileFrontmatter(text);

  if (fileFrontmatterText !== null) {
    let rawFm: unknown;
    try {
      rawFm = parseYaml(fileFrontmatterText);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(fileProblem(filename, `Invalid file frontmatter YAML: ${message}`));
    }
    if (rawFm !== undefined) {
      const fmResult = BacklogFrontmatterSchema.safeParse(rawFm);
      if (!fmResult.success) {
        problems.push(
          fileProblem(
            filename,
            `Backlog frontmatter failed validation: ${fmResult.error.issues.map((i) => i.message).join('; ')}`,
          ),
        );
      }
    }
  }

  const { preamble, segments } = splitBody(body);
  const { tasks, problems: taskProblems } = parseTasks(segments, filename, customFields);
  problems.push(...taskProblems);

  return {
    value: {
      filename,
      frontmatter: {},
      preamble,
      tasks,
    },
    problems,
  };
};

// An epic file: the epic itself, plus the task sections an older build stored in
// it — each stamped with the file's slug, which was the membership rule then.
export interface EpicFile {
  epic: Epic;
  tasks: Task[];
}

export const parseEpic = (
  text: string,
  filename: string,
  slug: string,
  customFields: readonly CustomField[] = [],
): ParseResult<EpicFile> => {
  const problems: ParseProblem[] = [];
  const { fileFrontmatterText, body } = splitFileFrontmatter(text);

  if (fileFrontmatterText === null) {
    problems.push(fileProblem(filename, 'Missing file frontmatter block.'));
    return { value: null, problems };
  }

  let rawFm: unknown;
  try {
    rawFm = parseYaml(fileFrontmatterText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    problems.push(fileProblem(filename, `Invalid file frontmatter YAML: ${message}`));
    return { value: null, problems };
  }

  const fmResult = EpicFrontmatterSchema.safeParse(rawFm);
  if (!fmResult.success) {
    problems.push(
      fileProblem(
        filename,
        `Epic frontmatter failed validation: ${fmResult.error.issues.map((i) => i.message).join('; ')}`,
      ),
    );
    return { value: null, problems };
  }

  const { preamble, segments } = splitBody(body);
  const { tasks, problems: taskProblems } = parseTasks(segments, filename, customFields);
  problems.push(...taskProblems);

  return {
    value: {
      epic: { filename, slug, frontmatter: fmResult.data, preamble },
      tasks: tasks.map((t) => withEpicOnTask(t, slug)),
    },
    problems,
  };
};

const parseDocFrontmatter = (
  fileFrontmatterText: string | null,
  path: string,
): ParseResult<DocPageFrontmatter> => {
  const problems: ParseProblem[] = [];

  // No frontmatter at all is a normal hand-authored page, not a problem.
  if (fileFrontmatterText === null) {
    return { value: {}, problems };
  }

  let rawFm: unknown;
  try {
    rawFm = parseYaml(fileFrontmatterText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    problems.push(fileProblem(path, `Invalid page frontmatter YAML: ${message}`));
    return { value: null, problems };
  }

  const fmResult = DocPageFrontmatterSchema.safeParse(rawFm);
  if (!fmResult.success) {
    problems.push(
      fileProblem(
        path,
        `Page frontmatter failed validation: ${fmResult.error.issues.map((i) => i.message).join('; ')}`,
      ),
    );
    return { value: null, problems };
  }

  return { value: fmResult.data, problems };
};

export const parseDocMetadata = (
  text: string,
  path: string,
  slug: string,
): ParseResult<Omit<DocPage, 'body'>> => {
  const { fileFrontmatterText } = splitFileFrontmatter(text);
  const { value, problems } = parseDocFrontmatter(fileFrontmatterText, path);
  return { value: value === null ? null : { path, slug, frontmatter: value }, problems };
};

export const parseDocPage = (
  text: string,
  path: string,
  slug: string,
): ParseResult<DocPage> => {
  const { fileFrontmatterText, body } = splitFileFrontmatter(text);
  const { value, problems } = parseDocFrontmatter(fileFrontmatterText, path);
  // Match the serializer's trailing newline so editor content round-trips.
  return {
    value: value === null ? null : { path, slug, frontmatter: value, body: body.replace(/\n+$/, '') },
    problems,
  };
};
