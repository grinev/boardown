import yaml from 'js-yaml';
import {
  type Backlog,
  BacklogFrontmatterSchema,
  type Epic,
  EpicFrontmatterSchema,
  type Release,
  ReleaseFrontmatterSchema,
  type Task,
  TaskFrontmatterSchema,
} from './schemas.js';
import {
  fileProblem,
  type ParseProblem,
  type ParseResult,
  taskProblem,
} from './problems.js';

const FRONTMATTER_FENCE = '---';

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
}

interface BodySplit {
  preamble: string;
  segments: RawTaskSegment[];
}

const splitBody = (body: string): BodySplit => {
  const lines = body.split('\n');
  const taskStarts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
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

    segments.push({ title, yamlText, description });
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
): { tasks: Task[]; problems: ParseProblem[] } => {
  const tasks: Task[] = [];
  const problems: ParseProblem[] = [];

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
        rawData && typeof rawData === 'object' && 'id' in rawData && typeof (rawData as { id: unknown }).id === 'string'
          ? ((rawData as { id: string }).id)
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

    tasks.push({
      title: segment.title,
      description: segment.description,
      frontmatter: result.data,
    });
  });

  return { tasks, problems };
};

export const parseRelease = (
  text: string,
  filename: string,
  slug: string,
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
  const { tasks, problems: taskProblems } = parseTasks(segments, filename);
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

const stripEpicFromTask = (task: Task): Task => {
  if (task.frontmatter.epic === undefined) return task;
  const { epic: _omit, ...rest } = task.frontmatter;
  return { ...task, frontmatter: rest };
};

const withEpicOnTask = (task: Task, slug: string): Task =>
  task.frontmatter.epic === slug
    ? task
    : { ...task, frontmatter: { ...task.frontmatter, epic: slug } };

export const parseBacklog = (text: string, filename: string): ParseResult<Backlog> => {
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
  const { tasks, problems: taskProblems } = parseTasks(segments, filename);
  problems.push(...taskProblems);

  return {
    value: {
      filename,
      frontmatter: {},
      preamble,
      tasks: tasks.map(stripEpicFromTask),
    },
    problems,
  };
};

export const parseEpic = (
  text: string,
  filename: string,
  slug: string,
): ParseResult<Epic> => {
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
  const { tasks, problems: taskProblems } = parseTasks(segments, filename);
  problems.push(...taskProblems);

  return {
    value: {
      filename,
      slug,
      frontmatter: fmResult.data,
      preamble,
      tasks: tasks.map((t) => withEpicOnTask(t, slug)),
    },
    problems,
  };
};
