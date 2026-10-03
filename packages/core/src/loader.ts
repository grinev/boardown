import { BACKLOG_PATH, DOCS_DIR, EPICS_DIR, RELEASES_DIR } from './board-ops.js';
import {
  CONFIG_FILENAME,
  checkMinVersion,
  parseConfig,
  serializeConfig,
  withMinVersionStamp,
} from './config.js';
import { type DocFolder, sortDocsTree } from './docs.js';
import type { FsAdapter, FsEntry } from './fs-adapter.js';
import { verifyNextId } from './id-generator.js';
import {
  gatherLayout,
  LEGACY_BACKLOG_PATH,
  type LayoutConversion,
  type LegacyEpicFile,
} from './layout.js';
import { parseBacklog, parseDocPage, parseEpic, parseRelease } from './parser.js';
import { fileProblem, type ParseProblem } from './problems.js';
import type { Backlog, BoardConfig, Epic, Release, Task } from './schemas.js';

export interface BoardSnapshot {
  config: BoardConfig;
  releases: Release[];
  epics: Epic[];
  // `backlog.md`: every task in no release, including those an older build left in
  // epic files, gathered here until the next write moves them on disk.
  backlog: Backlog | null;
  // Old-layout files that could not be gathered; shown, never written.
  heldBack: Backlog[];
  docs: DocFolder;
  problems: ParseProblem[];
}

export type LoadBoardResult =
  | {
      kind: 'loaded';
      snapshot: BoardSnapshot;
      problems: ParseProblem[];
      fileVersions: Record<string, number>;
      // What the next write of file content must also carry; see layout.ts.
      conversion: LayoutConversion | null;
    }
  | { kind: 'missing-config' }
  | { kind: 'failed'; problems: ParseProblem[] }
  | { kind: 'version-too-old'; required: string; running: string };

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

const collectTasks = (releases: Release[], backlog: Backlog | null, heldBack: Backlog[]): Task[] => {
  const out: Task[] = [];
  for (const r of releases) out.push(...r.tasks);
  if (backlog) out.push(...backlog.tasks);
  for (const b of heldBack) out.push(...b.tasks);
  return out;
};

const withoutEpic = (task: Task): Task => {
  if (task.frontmatter.epic === undefined) return task;
  const { epic: _omit, ...rest } = task.frontmatter;
  return { ...task, frontmatter: rest };
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

  const gate = checkMinVersion(configText);
  if (gate.kind === 'too-old') {
    return { kind: 'version-too-old', required: gate.required, running: gate.running };
  }

  const configResult = parseConfig(configText);
  if (configResult.value === null) {
    return { kind: 'failed', problems: configResult.problems };
  }
  let config = configResult.value;

  const releaseFiles = fileNames(await safeList(fs, RELEASES_DIR)).filter(isMarkdownFile);
  const epicFiles = fileNames(await safeList(fs, EPICS_DIR))
    .filter(isMarkdownFile)
    .filter((name) => `${EPICS_DIR}/${name}` !== LEGACY_BACKLOG_PATH);

  const customFields = config.customFields ?? [];

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
    const parsed = parseRelease(text, path, slug, customFields);
    problems.push(...parsed.problems);
    if (parsed.value !== null) releases.push(parsed.value);
  }

  const epics: Epic[] = [];
  const legacyEpicFiles: LegacyEpicFile[] = [];
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
    const parsed = parseEpic(text, path, slug, customFields);
    problems.push(...parsed.problems);
    if (parsed.value !== null) {
      epics.push(parsed.value.epic);
      legacyEpicFiles.push({ path, text, tasks: parsed.value.tasks });
    } else {
      // No epic and nothing to move, but its task sections still count against a
      // complete conversion.
      legacyEpicFiles.push({ path, text, tasks: [] });
    }
  }

  // Both are optional: a board with no unscheduled task has no backlog.md, and
  // only an older build ever wrote no_epic.md.
  const readBacklogFile = async (path: string): Promise<Backlog | null> => {
    if ((await fs.stat(path)) === null) return null;
    let text: string;
    try {
      text = await fs.read(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      problems.push(fileProblem(path, `Cannot read file: ${message}`));
      return { filename: path, frontmatter: {}, preamble: '', tasks: [] };
    }
    await recordVersion(path);
    const parsed = parseBacklog(text, path, customFields);
    problems.push(...parsed.problems);
    return parsed.value;
  };

  const backlogFile = await readBacklogFile(BACKLOG_PATH);
  const legacyBacklogFile = await readBacklogFile(LEGACY_BACKLOG_PATH);
  const gathered = gatherLayout({
    backlog: backlogFile,
    epicFiles: legacyEpicFiles,
    // The old layout's rule: a task in no_epic.md has no epic, whatever it says.
    legacyBacklog:
      legacyBacklogFile === null
        ? null
        : { ...legacyBacklogFile, tasks: legacyBacklogFile.tasks.map(withoutEpic) },
    problems,
  });
  problems.push(...gathered.problems);
  const { backlog, heldBack } = gathered;

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

  const verified = verifyNextId(config, collectTasks(releases, backlog, heldBack));
  // Through the raw adapter, never a shell's write path: opening a board must not
  // carry the layout conversion, which lands with the first write of content.
  if (verified.bumped) {
    const next = withMinVersionStamp(verified.config);
    try {
      await fs.write(CONFIG_FILENAME, serializeConfig(next));
      config = next;
      await recordVersion(CONFIG_FILENAME);
    } catch (err) {
      config = verified.config;
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
    snapshot: { config, releases, epics, backlog, heldBack, docs, problems },
    problems,
    fileVersions,
    conversion: gathered.conversion,
  };
};
