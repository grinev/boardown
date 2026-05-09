import { CONFIG_FILENAME, parseConfig, serializeConfig } from './config.js';
import type { FsAdapter } from './fs-adapter.js';
import { verifyNextId } from './id-generator.js';
import { parseEpic, parseRelease } from './parser.js';
import {
  fileProblem,
  type ParseProblem,
  type ParseResult,
} from './problems.js';
import type { BoardConfig, Epic, Release, Task } from './schemas.js';

export interface BoardSnapshot {
  config: BoardConfig;
  releases: Release[];
  epics: Epic[];
  problems: ParseProblem[];
}

const RELEASES_DIR = 'releases';
const EPICS_DIR = 'epics';

const safeList = async (fs: FsAdapter, dir: string): Promise<string[]> => {
  try {
    return await fs.list(dir);
  } catch {
    return [];
  }
};

const isMarkdownFile = (name: string): boolean => name.endsWith('.md');

const collectTasks = (releases: Release[], epics: Epic[]): Task[] => {
  const out: Task[] = [];
  for (const r of releases) out.push(...r.tasks);
  for (const e of epics) out.push(...e.tasks);
  return out;
};

export const loadBoard = async (fs: FsAdapter): Promise<ParseResult<BoardSnapshot>> => {
  const problems: ParseProblem[] = [];

  let configText: string;
  try {
    configText = await fs.read(CONFIG_FILENAME);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      value: null,
      problems: [fileProblem(CONFIG_FILENAME, `Cannot read config: ${message}`)],
    };
  }

  const configResult = parseConfig(configText);
  if (configResult.value === null) {
    return { value: null, problems: configResult.problems };
  }
  let config = configResult.value;

  // tasksDir resolution against the config folder lands in the next roadmap item;
  // for now task containers live alongside config.yaml under their hardcoded names.
  const releaseFiles = (await safeList(fs, RELEASES_DIR)).filter(isMarkdownFile);
  const epicFiles = (await safeList(fs, EPICS_DIR)).filter(isMarkdownFile);

  const releases: Release[] = [];
  for (const name of releaseFiles) {
    const path = `${RELEASES_DIR}/${name}`;
    let text: string;
    try {
      text = await fs.read(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(fileProblem(path, `Cannot read file: ${message}`));
      continue;
    }
    const parsed = parseRelease(text, path);
    problems.push(...parsed.problems);
    if (parsed.value !== null) releases.push(parsed.value);
  }

  const epics: Epic[] = [];
  for (const name of epicFiles) {
    const path = `${EPICS_DIR}/${name}`;
    const slug = name.replace(/\.md$/, '');
    let text: string;
    try {
      text = await fs.read(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(fileProblem(path, `Cannot read file: ${message}`));
      continue;
    }
    const parsed = parseEpic(text, path, slug);
    problems.push(...parsed.problems);
    if (parsed.value !== null) epics.push(parsed.value);
  }

  const verified = verifyNextId(config, collectTasks(releases, epics));
  if (verified.bumped) {
    config = verified.config;
    try {
      await fs.write(CONFIG_FILENAME, serializeConfig(config));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(
        fileProblem(
          CONFIG_FILENAME,
          `nextId fell behind, but writing the bumped config failed: ${message}`,
          'warning',
        ),
      );
    }
  }

  return {
    value: { config, releases, epics, problems },
    problems,
  };
};
