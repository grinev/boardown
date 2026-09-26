import { BACKLOG_PATH, EPICS_DIR } from './board-ops.js';
import type { GuardedChange, GuardedFile, GuardedFs, GuardedWrite } from './conflicts.js';
import { textAboveFirstTask } from './parser.js';
import { fileProblem, type ParseProblem } from './problems.js';
import type { Backlog, Task } from './schemas.js';
import { serializeBacklog } from './serializer.js';

/**
 * The old on-disk layout, and its conversion to the current one. Older builds
 * kept every unscheduled task inside an epic file (`epics/<slug>.md`, the file
 * being the membership) or in `epics/no_epic.md`; the current layout keeps them
 * all in `backlog.md`, each naming its epic in its own `epic` key.
 *
 * The loader reads the old layout and hands it here; nothing else in the code
 * knows it existed. What comes back is the board in the current layout — every
 * readable old-layout task gathered into the backlog in memory — plus the disk
 * side of that gathering, which lands with the next write of file content and
 * never on a read.
 */

export const LEGACY_BACKLOG_PATH = `${EPICS_DIR}/no_epic.md`;

export interface LegacyEpicFile {
  path: string;
  // Exactly as read, so the epic's own lines above its first task survive the cut
  // byte for byte.
  text: string;
  tasks: Task[];
}

export interface OldLayout {
  // `backlog.md`, null when the file does not exist.
  backlog: Backlog | null;
  epicFiles: LegacyEpicFile[];
  // `epics/no_epic.md`, its tasks already without an `epic` key; null when absent.
  legacyBacklog: Backlog | null;
  problems: readonly ParseProblem[];
}

// What still has to happen on disk for the board to be in the layout memory
// already shows. `backlog.md` is not part of it: its text always comes from the
// in-memory backlog at write time, so an operation on the backlog and the
// conversion can never disagree about it.
export interface LayoutConversion {
  writeBacklog: boolean;
  epicCuts: GuardedFile[];
  removes: string[];
  // The file a gathered task still sits in until the conversion lands.
  sources: ReadonlyMap<Task, string>;
}

export interface GatheredLayout {
  backlog: Backlog | null;
  // Old-layout files the conversion leaves in place because it cannot move out of
  // them (a block the parser could not read) or into `backlog.md` (the same). Their
  // tasks stay shown; a write to one is refused by the guard.
  heldBack: Backlog[];
  problems: ParseProblem[];
  conversion: LayoutConversion | null;
}

const isReadable = (problems: readonly ParseProblem[], path: string): boolean =>
  !problems.some((p) => p.file === path && p.level === 'error');

const byOrder = (a: { task: Task }, b: { task: Task }): number =>
  a.task.frontmatter.order - b.task.frontmatter.order;

const joinText = (...parts: string[]): string =>
  parts
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join('\n\n');

export const gatherLayout = (layout: OldLayout): GatheredLayout => {
  const { backlog, epicFiles, legacyBacklog } = layout;
  const problems: ParseProblem[] = [];
  const heldBack: Backlog[] = [];
  const holdBack = (path: string, tasks: Task[]): void => {
    if (tasks.length > 0) heldBack.push({ filename: path, frontmatter: {}, preamble: '', tasks });
  };

  // Nothing can move into a file that cannot be written, so a broken `backlog.md`
  // keeps every old-layout file where it is. Those that are readable would slip
  // past the guard's own rule, so each is given an error of its own: a write
  // through the wrong serializer would drop the epic's metadata or its tasks.
  if (backlog !== null && !isReadable(layout.problems, backlog.filename)) {
    const stranded: { path: string; tasks: Task[] }[] = [
      ...epicFiles.filter((f) => f.tasks.length > 0),
      ...(legacyBacklog !== null
        ? [{ path: legacyBacklog.filename, tasks: legacyBacklog.tasks }]
        : []),
    ];
    for (const file of stranded) {
      holdBack(file.path, file.tasks);
      if (isReadable(layout.problems, file.path)) {
        problems.push(
          fileProblem(file.path, `Not moved into ${BACKLOG_PATH}, which could not be read.`),
        );
      }
    }
    return { backlog, heldBack, problems, conversion: null };
  }

  const moved: { task: Task; path: string }[] = [];
  const epicCuts: GuardedFile[] = [];
  const removes: string[] = [];
  let movedText = '';

  for (const file of epicFiles) {
    if (file.tasks.length === 0) continue;
    const kept = textAboveFirstTask(file.text);
    if (!isReadable(layout.problems, file.path) || kept === null) {
      holdBack(file.path, file.tasks);
      continue;
    }
    for (const task of file.tasks) moved.push({ task, path: file.path });
    epicCuts.push({ path: file.path, content: kept });
  }

  if (legacyBacklog !== null) {
    if (isReadable(layout.problems, legacyBacklog.filename)) {
      for (const task of legacyBacklog.tasks) moved.push({ task, path: legacyBacklog.filename });
      movedText = legacyBacklog.preamble;
      removes.push(legacyBacklog.filename);
    } else {
      holdBack(legacyBacklog.filename, legacyBacklog.tasks);
    }
  }

  if (epicCuts.length === 0 && removes.length === 0) {
    return { backlog, heldBack, problems, conversion: null };
  }

  // The Backlog's display order, after whatever `backlog.md` already holds; the
  // sort is stable, so ties keep the order the old layout listed them in.
  moved.sort(byOrder);
  const writeBacklog = moved.length > 0 || movedText.trim() !== '';
  const gathered: Backlog | null = writeBacklog
    ? {
        filename: BACKLOG_PATH,
        frontmatter: {},
        preamble: joinText(backlog?.preamble ?? '', movedText),
        tasks: [...(backlog?.tasks ?? []), ...moved.map((m) => m.task)],
      }
    : backlog;

  return {
    backlog: gathered,
    heldBack,
    problems,
    conversion: {
      writeBacklog,
      epicCuts,
      removes,
      sources: new Map(moved.map((m) => [m.task, m.path])),
    },
  };
};

export interface ConvertingFs extends GuardedFs {
  // The file a gathered task still sits in, until the conversion has landed.
  sourceOf(task: Task): string | undefined;
}

// Folds a pending conversion into the next write of file content, whatever it is,
// so no write path can forget it and none re-implements it. The conversion is
// dropped once a write carrying it has landed, and kept when one is refused; while
// one is in flight, any other write waits for it, so two writes can never both
// carry it — or one carry `backlog.md` without the cuts that make it true.
// Deletions and folder creation pass through: like the minVersion stamp, the
// conversion rides writes of content only.
export const createConvertingFs = (
  inner: GuardedFs,
  conversion: LayoutConversion | null,
  currentBacklog: () => Backlog | null,
): ConvertingFs => {
  let pending = conversion;
  let inFlight: Promise<void> | null = null;

  const fold = (change: GuardedChange, taken: LayoutConversion): GuardedChange => {
    const own = new Set(change.writes.map((w) => w.path));
    const backlogWrites: GuardedWrite[] = change.writes.filter((w) => w.path === BACKLOG_PATH);
    if (taken.writeBacklog && !own.has(BACKLOG_PATH)) {
      const backlog = currentBacklog();
      if (backlog !== null) backlogWrites.push({ path: BACKLOG_PATH, content: serializeBacklog(backlog) });
    }
    // Every file a task can land in is written before any file a task leaves: a
    // process killed between two steps then leaves a task in two files, never in
    // none. So `backlog.md` first, then the operation's own files, then the cuts.
    const writes = [
      ...backlogWrites,
      ...change.writes.filter((w) => w.path !== BACKLOG_PATH),
      ...taken.epicCuts.filter((cut) => !own.has(cut.path)),
    ];
    const removes = [...change.removes, ...taken.removes.filter((p) => !change.removes.includes(p))];
    return { writes, removes };
  };

  const commit = async (change: GuardedChange): Promise<void> => {
    while (inFlight !== null) {
      try {
        await inFlight;
      } catch {
        // The first write's own caller reports its failure.
      }
    }
    const taken = pending;
    if (taken === null) {
      await inner.commit(change);
      return;
    }
    const run = inner.commit(fold(change, taken));
    inFlight = run;
    try {
      await run;
      pending = null;
    } finally {
      inFlight = null;
    }
  };

  return {
    ...inner,
    commit,
    async write(path, content) {
      if (pending === null && inFlight === null) {
        await inner.write(path, content);
        return;
      }
      await commit({ writes: [{ path, content }], removes: [] });
    },
    writeAll: (files) => commit({ writes: files, removes: [] }),
    moveFile: (from, to, content) =>
      commit({ writes: [{ path: to, content, createOnly: true }], removes: [from] }),
    sourceOf: (task) => pending?.sources.get(task),
  };
};
