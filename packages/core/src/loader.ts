import { BACKLOG_BASENAME, BACKLOG_PATH, DOCS_DIR, EPICS_DIR, RELEASES_DIR } from './board-ops.js';
import { CONFIG_FILENAME, parseConfig, serializeConfig } from './config.js';
import { type DocFolder, sortDocsTree } from './docs.js';
import type { FsAdapter, FsEntry } from './fs-adapter.js';
import { verifyNextId } from './id-generator.js';
import { parseBacklog, parseDocPage, parseEpic, parseRelease } from './parser.js';
import { fileProblem, type ParseProblem } from './problems.js';
import type { Backlog, BoardConfig, Epic, Release, Task } from './schemas.js';

export interface BoardSnapshot {
  config: BoardConfig;
  releases: Release[];
  epics: Epic[];
  backlog: Backlog | null;
  docs: DocFolder;
  problems: ParseProblem[];
}

export type LoadBoardResult =
  | {
      kind: 'loaded';
      snapshot: BoardSnapshot;
      problems: ParseProblem[];
      fileVersions: Record<string, number>;
    }
  | { kind: 'missing-config' }
  | { kind: 'failed'; problems: ParseProblem[] };

const safeList = async (fs: FsAdapter, dir: string): Promise<FsEntry[]> => {
  try {
    return await fs.list(dir);
  } catch {
    return [];
  }
};

const fileNames = (entries: FsEntry[]): string[] =>
  entries.filter((e) => !e.isDirectory).map((e) => e.name);

const isMarkdownFile = (name: string): boolean => name.endsWith('.md');

const collectTasks = (releases: Release[], epics: Epic[], backlog: Backlog | null): Task[] => {
  const out: Task[] = [];
  for (const r of releases) out.push(...r.tasks);
  for (const e of epics) out.push(...e.tasks);
  if (backlog) out.push(...backlog.tasks);
  return out;
};

export const loadBoard = async (fs: FsAdapter): Promise<LoadBoardResult> => {
  const stat = await fs.stat(CONFIG_FILENAME);
  if (stat === null) {
    return { kind: 'missing-config' };
  }

  const problems: ParseProblem[] = [];
  const fileVersions: Record<string, number> = { [CONFIG_FILENAME]: stat.lastModified };

  const recordVersion = async (path: string): Promise<void> => {
    const s = await fs.stat(path);
    if (s !== null) fileVersions[path] = s.lastModified;
  };

  let configText: string;
  try {
    configText = await fs.read(CONFIG_FILENAME);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: 'failed',
      problems: [fileProblem(CONFIG_FILENAME, `Cannot read config: ${message}`)],
    };
  }

  const configResult = parseConfig(configText);
  if (configResult.value === null) {
    return { kind: 'failed', problems: configResult.problems };
  }
  let config = configResult.value;

  const releaseFiles = fileNames(await safeList(fs, RELEASES_DIR)).filter(isMarkdownFile);
  const epicFiles = fileNames(await safeList(fs, EPICS_DIR))
    .filter(isMarkdownFile)
    .filter((name) => name !== BACKLOG_BASENAME);

  const releases: Release[] = [];
  for (const name of releaseFiles) {
    const path = `${RELEASES_DIR}/${name}`;
    const slug = name.replace(/\.md$/, '');
    let text: string;
    try {
      text = await fs.read(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(fileProblem(path, `Cannot read file: ${message}`));
      continue;
    }
    await recordVersion(path);
    const parsed = parseRelease(text, path, slug);
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
    await recordVersion(path);
    const parsed = parseEpic(text, path, slug);
    problems.push(...parsed.problems);
    if (parsed.value !== null) epics.push(parsed.value);
  }

  let backlog: Backlog | null = null;
  try {
    const backlogText = await fs.read(BACKLOG_PATH);
    await recordVersion(BACKLOG_PATH);
    const parsed = parseBacklog(backlogText, BACKLOG_PATH);
    problems.push(...parsed.problems);
    if (parsed.value !== null) backlog = parsed.value;
  } catch {
    // no_epic.md is optional — missing file is the common case
  }

  const readDocsFolder = async (path: string, name: string): Promise<DocFolder> => {
    const entries = await safeList(fs, path);
    const folder: DocFolder = { path, name, folders: [], pages: [], otherEntries: [] };

    for (const entry of entries) {
      const childPath = `${path}/${entry.name}`;
      if (entry.isDirectory) {
        folder.folders.push(await readDocsFolder(childPath, entry.name));
        continue;
      }
      // A file the tree does not show still occupies its name on disk, so it is
      // recorded: creating a page or folder must not be allowed to clobber it.
      if (!isMarkdownFile(entry.name)) {
        folder.otherEntries.push(entry.name);
        continue;
      }
      let text: string;
      try {
        text = await fs.read(childPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        problems.push(fileProblem(childPath, `Cannot read file: ${message}`));
        folder.otherEntries.push(entry.name);
        continue;
      }
      await recordVersion(childPath);
      const parsed = parseDocPage(text, childPath, entry.name.replace(/\.md$/, ''));
      problems.push(...parsed.problems);
      if (parsed.value !== null) folder.pages.push(parsed.value);
      else folder.otherEntries.push(entry.name);
    }

    return folder;
  };

  const docs = sortDocsTree(await readDocsFolder(DOCS_DIR, DOCS_DIR));

  const verified = verifyNextId(config, collectTasks(releases, epics, backlog));
  if (verified.bumped) {
    config = verified.config;
    try {
      await fs.write(CONFIG_FILENAME, serializeConfig(config));
      await recordVersion(CONFIG_FILENAME);
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
    kind: 'loaded',
    snapshot: { config, releases, epics, backlog, docs, problems },
    problems,
    fileVersions,
  };
};
