import { z } from 'zod';
import {
  attachmentsDir,
  BACKLOG_PATH,
  DOCS_DIR,
  EPICS_DIR,
  isFrozenRelease,
  RELEASES_DIR,
} from './board-ops.js';
import { CONFIG_FILENAME, parseConfig, serializeConfig } from './config.js';
import type { GuardedChange, GuardedFs, GuardedWrite } from './conflicts.js';
import { readDocPage } from './docs.js';
import type { FsAdapter } from './fs-adapter.js';
import { nextTaskId, verifyNextId } from './id-generator.js';
import { LEGACY_BACKLOG_PATH } from './layout.js';
import type { BoardSnapshot } from './loader.js';
import { parseBacklog, parseEpic, parseRelease, textAboveFirstTask } from './parser.js';
import { fileProblem, type ParseProblem } from './problems.js';
import { markdownTaskRefs, proseTaskRefs } from './refs.js';
import { LINK_TYPE_META, type Task, type TaskLink } from './schemas.js';
import { serializeBacklog, serializeRelease } from './serializer.js';
import { currentMoment, withUpdatedAt } from './task-dates.js';
import {
  collectDuplicateProblems,
  duplicateTaskProblem,
  preserveTaskBlock,
  taskContainers,
  taskOccurrences,
  type TaskOccurrence,
} from './task-ids.js';

export interface TaskIdRepair {
  oldId: string;
  newId: string;
  title: string;
  file: string;
}

export class DuplicateIdRepairBlocked extends Error {
  constructor(
    readonly id: string,
    readonly problems: ParseProblem[],
  ) {
    super(`Duplicate task ID ${id} cannot be repaired safely.`);
  }
}

const date = z.iso.datetime({ offset: true });
const createdTime = (task: Task): number =>
  date.safeParse(task.frontmatter.createdAt).success
    ? Date.parse(task.frontmatter.createdAt ?? '')
    : NaN;

interface Reference {
  id: string;
  problem: ParseProblem;
}

const proseReferences = (
  snapshot: BoardSnapshot,
  sourceOf?: (task: Task) => string | undefined,
): Reference[] => {
  const references: Reference[] = [];
  const add = (text: string, file: string, where: string): void => {
    for (const id of new Set(proseTaskRefs(text))) {
      references.push({ id, problem: fileProblem(file, `${where} references ${id}.`, 'warning') });
    }
  };
  for (const epic of snapshot.epics) add(epic.preamble, epic.filename, 'Epic description');
  for (const release of snapshot.releases) {
    add(
      release.frontmatter.description ?? release.preamble,
      release.filename,
      'Release description',
    );
  }
  for (const container of taskContainers(snapshot)) {
    for (const task of container.tasks) {
      const name = `${task.frontmatter.id} "${task.title}"`;
      const path = sourceOf?.(task) ?? container.filename;
      add(task.description, path, `Description of ${name}`);
      for (const note of task.frontmatter.notes ?? [])
        add(note.text, path, `Note ${note.id} of ${name}`);
      for (const [key, value] of Object.entries(task.frontmatter.custom ?? {}))
        add(value, path, `Custom field ${key} of ${name}`);
    }
  }
  return references;
};

interface Evidence {
  versions: Map<string, number | null>;
  directories: Map<string, string>;
}

const entriesIn = async (fs: FsAdapter, path: string) =>
  (await fs.list(path)).filter((entry) =>
    entry.isDirectory
      ? path === DOCS_DIR || path.startsWith(`${DOCS_DIR}/`)
      : entry.name.endsWith('.md'),
  );
const signature = (entries: Awaited<ReturnType<FsAdapter['list']>>): string =>
  JSON.stringify(
    entries.map(({ name, isDirectory }) => `${isDirectory ? 'd' : 'f'}:${name}`).sort(),
  );

class StaleRepairEvidence extends Error {
  constructor(
    readonly path: string,
    readonly id?: string,
  ) {
    super(`Cannot verify repair evidence in ${path}; it changed or could not be read.`);
  }
}

const inspectReferences = async (
  fs: GuardedFs,
  snapshot: BoardSnapshot,
  evidence: Evidence,
  references: Reference[],
): Promise<void> => {
  const version = async (path: string): Promise<void> => {
    const current = (await fs.stat(path))?.lastModified ?? null;
    if (current !== (fs.observedVersion(path) ?? null)) throw new StaleRepairEvidence(path);
    evidence.versions.set(path, current);
  };
  await version(CONFIG_FILENAME);
  await version(BACKLOG_PATH);
  for (const dir of [RELEASES_DIR, EPICS_DIR]) {
    const entries = await entriesIn(fs, dir);
    evidence.directories.set(dir, signature(entries));
    for (const entry of entries) await version(`${dir}/${entry.name}`);
  }
  for (const { filename } of [...snapshot.releases, ...snapshot.epics, ...snapshot.heldBack])
    await version(filename);

  const walk = async (path: string): Promise<void> => {
    const entries = await entriesIn(fs, path);
    evidence.directories.set(path, signature(entries));
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(child);
        continue;
      }
      const result = await readDocPage(fs, child);
      if (result.kind !== 'ready') throw new StaleRepairEvidence(child);
      evidence.versions.set(child, result.version);
      for (const id of new Set(markdownTaskRefs(result.value.body)))
        references.push({
          id,
          problem: fileProblem(child, `Docs body references ${id}.`, 'warning'),
        });
    }
  };
  if ((await fs.list('.')).some((entry) => entry.name === DOCS_DIR && !entry.isDirectory))
    throw new StaleRepairEvidence(DOCS_DIR);
  await walk(DOCS_DIR);
};

interface Mirror {
  owner: TaskOccurrence;
  other: TaskOccurrence;
  link: TaskLink;
}

const inspectMirrors = (
  id: string,
  copies: readonly TaskOccurrence[],
  all: ReadonlyMap<string, TaskOccurrence[]>,
  blockers: ParseProblem[],
): Mirror[] => {
  const mirrors: Mirror[] = [];
  const fail = (occurrence: TaskOccurrence, other: string): void => {
    blockers.push(
      fileProblem(
        occurrence.file,
        `Task block ${occurrence.taskIndex + 1}: the link between ${id} and ${other} has no unique inverse.`,
        'warning',
      ),
    );
  };
  for (const occurrences of all.values()) {
    for (const other of occurrences) {
      for (const link of other.task.frontmatter.links ?? []) {
        if (link.to !== id) continue;
        const otherId = other.task.frontmatter.id;
        const inverse = LINK_TYPE_META[link.type].inverse;
        const owners = copies.flatMap((copy) =>
          (copy.task.frontmatter.links ?? [])
            .filter((edge) => edge.to === otherId && edge.type === inverse)
            .map(() => copy),
        );
        if (otherId === id || occurrences.length !== 1 || owners.length !== 1 || !owners[0]) {
          fail(other, otherId);
          continue;
        }
        mirrors.push({ owner: owners[0], other, link });
      }
    }
  }
  for (const owner of copies) {
    for (const link of owner.task.frontmatter.links ?? []) {
      const matching = mirrors.filter(
        (mirror) =>
          mirror.owner === owner &&
          mirror.other.task.frontmatter.id === link.to &&
          mirror.link.type === LINK_TYPE_META[link.type].inverse,
      );
      if (matching.length !== 1) fail(owner, link.to);
    }
  }
  return mirrors;
};

const applyOrdinaryDraft = (snapshot: BoardSnapshot, change: GuardedChange): BoardSnapshot => {
  let config = snapshot.config;
  const configWrite = change.writes.find((write) => write.path === CONFIG_FILENAME);
  if (typeof configWrite?.content === 'string')
    config = parseConfig(configWrite.content).value ?? config;
  const fields = config.customFields ?? [];
  let backlog = snapshot.backlog;
  const releases = [...snapshot.releases];
  const heldBack = [...snapshot.heldBack];
  const epics = [...snapshot.epics];
  const problems = [...snapshot.problems];
  for (const { path, content } of change.writes) {
    if (typeof content !== 'string') continue;
    if (path === BACKLOG_PATH) {
      const result = parseBacklog(content, path, fields);
      problems.push(...result.problems);
      backlog = result.value;
    } else {
      const release = releases.findIndex((r) => r.filename === path);
      if (release !== -1) {
        const result = parseRelease(content, path, releases[release]?.slug ?? '', fields);
        problems.push(...result.problems);
        if (result.value) releases[release] = result.value;
        continue;
      }
      const held = heldBack.findIndex((container) => container.filename === path);
      if (held === -1) continue;
      const preamble = textAboveFirstTask(content) ?? content;
      if (path === LEGACY_BACKLOG_PATH) {
        const result = parseBacklog(content, path, fields);
        problems.push(...result.problems);
        if (result.value) heldBack[held] = { ...result.value, preamble };
      } else {
        const epic = epics.findIndex((item) => item.filename === path);
        if (epic === -1) continue;
        const result = parseEpic(content, path, epics[epic]?.slug ?? '', fields);
        problems.push(...result.problems);
        if (result.value) {
          epics[epic] = result.value.epic;
          heldBack[held] = { filename: path, preamble, tasks: result.value.tasks, frontmatter: {} };
        }
      }
    }
  }
  return { ...snapshot, config, releases, backlog, heldBack, epics, problems };
};

interface Candidate {
  id: string;
  renaming: TaskOccurrence[];
  mirrors: Mirror[];
  attachmentPath: string;
}

const evidenceProblem = (error: unknown): ParseProblem =>
  fileProblem(
    error instanceof StaleRepairEvidence ? error.path : '.',
    error instanceof Error ? error.message : String(error),
    'warning',
  );

const allocationIsSafe = (counter: number): boolean =>
  Number.isSafeInteger(counter) && Number.isSafeInteger(counter + 1) && counter > 0;

// The ordinary operation has already resolved its operands and serialized its draft.
// Nothing in the planner is persisted until the shared guard accepts the combined set.
export const commitWithTaskIdRepairs = async (
  fs: GuardedFs,
  snapshot: BoardSnapshot,
  ordinary: GuardedChange,
  explicitId?: string,
  sourceOf?: (task: Task) => string | undefined,
  onCommitted?: (snapshot: BoardSnapshot) => void,
): Promise<TaskIdRepair[]> => {
  const draft = applyOrdinaryDraft(snapshot, ordinary);
  const all = taskOccurrences(draft, sourceOf);
  const groups = [...all].filter(
    ([id, copies]) => copies.length > 1 && (explicitId === undefined || id === explicitId),
  );
  const withoutRepair = async (): Promise<TaskIdRepair[]> => {
    if (explicitId === undefined) await fs.commit(ordinary);
    return [];
  };
  if (groups.length === 0) return withoutRepair();
  for (const copies of all.values())
    if (copies.length > 1) for (const { task } of copies) preserveTaskBlock(task);

  const references = proseReferences(draft, sourceOf);
  const evidence: Evidence = { versions: new Map(), directories: new Map() };
  const commonBlockers = draft.problems.filter((problem) => problem.level === 'error');
  if (commonBlockers.length === 0) {
    try {
      await inspectReferences(fs, snapshot, evidence, references);
    } catch (error) {
      commonBlockers.push(evidenceProblem(error));
    }
  }
  const candidates: Candidate[] = [];
  for (const [id, copies] of groups) {
    const blockers = [...commonBlockers];
    const sorted = copies
      .map((copy) => ({ copy, date: createdTime(copy.task) }))
      .sort((a, b) => a.date - b.date);
    for (const [i, entry] of sorted.entries()) {
      if (!Number.isFinite(entry.date) || entry.date === sorted[i - 1]?.date)
        blockers.push(
          fileProblem(
            entry.copy.file,
            `Task block ${entry.copy.taskIndex + 1} needs a valid, distinct createdAt.`,
            'warning',
          ),
        );
    }
    const renaming = sorted.slice(1).map(({ copy }) => copy);
    for (const copy of renaming) {
      if (isFrozenRelease(copy.container, draft.config))
        blockers.push(fileProblem(copy.file, `${copy.title} is in a frozen release.`, 'warning'));
    }
    const mirrors = inspectMirrors(id, copies, all, blockers);
    blockers.push(
      ...references.filter((reference) => reference.id === id).map(({ problem }) => problem),
    );
    const attachmentPath = attachmentsDir(id);
    try {
      const entries = (await fs.list(attachmentPath)).filter((entry) => !entry.isDirectory);
      for (const entry of entries)
        blockers.push(
          fileProblem(
            `${attachmentPath}/${entry.name}`,
            `Attachment ownership for ${id} is ambiguous.`,
            'warning',
          ),
        );
      if (
        entries.length === 0 &&
        (await fs.list('attachments')).some((entry) => entry.name === id && !entry.isDirectory)
      )
        blockers.push(
          fileProblem(attachmentPath, 'Attachment path is not a directory.', 'warning'),
        );
    } catch {
      blockers.push(evidenceProblem(new StaleRepairEvidence(attachmentPath, id)));
    }
    if (blockers.length === 0) candidates.push({ id, renaming, mirrors, attachmentPath });
    else if (explicitId !== undefined)
      throw new DuplicateIdRepairBlocked(id, [duplicateTaskProblem(id, copies), ...blockers]);
  }

  let ready = candidates;
  while (ready.length > 0) {
    let { config } = verifyNextId(
      draft.config,
      [...all.values()].flatMap((items) => items.map(({ task }) => task)),
    );
    const allocated = new Map<Task, string>();
    const repairs: TaskIdRepair[] = [];
    const replacements = new Map<Task, Task>();
    const changed = new Set<string>();
    const newAttachmentPaths = new Map<string, string>();
    const now = currentMoment();
    const edit = (copy: TaskOccurrence, update: (task: Task) => Task): void => {
      replacements.set(
        copy.task,
        withUpdatedAt(update(replacements.get(copy.task) ?? copy.task), config, now),
      );
      changed.add(copy.container.filename);
    };
    try {
      for (const { id, renaming, mirrors } of ready) {
        for (const copy of renaming) {
          let newId: string;
          for (;;) {
            if (!allocationIsSafe(config.nextId))
              throw new StaleRepairEvidence(CONFIG_FILENAME, id);
            const next = nextTaskId(config);
            config = next.config;
            newId = next.id;
            try {
              if (!all.has(newId) && (await fs.stat(attachmentsDir(newId))) === null) break;
            } catch {
              throw new StaleRepairEvidence(attachmentsDir(newId), id);
            }
          }
          newAttachmentPaths.set(attachmentsDir(newId), id);
          allocated.set(copy.task, newId);
          edit(copy, (task) => ({ ...task, frontmatter: { ...task.frontmatter, id: newId } }));
          repairs.push({ oldId: id, newId, title: copy.title, file: copy.file });
        }
        for (const { owner, other, link } of mirrors) {
          const to = allocated.get(owner.task);
          if (to === undefined) continue;
          edit(other, (task) => ({
            ...task,
            frontmatter: {
              ...task.frontmatter,
              links: (task.frontmatter.links ?? []).map((edge) =>
                edge === link ? { ...edge, to } : edge,
              ),
            },
          }));
        }
      }
      const writes = new Map<string, GuardedWrite>(
        ordinary.writes.map((write) => [write.path, write]),
      );
      const put = (path: string, content: string): void => {
        writes.set(path, { ...writes.get(path), path, content });
      };
      for (const container of taskContainers(draft)) {
        if (!changed.has(container.filename)) continue;
        const tasks = container.tasks.map((task) => replacements.get(task) ?? task);
        let preamble = container.preamble;
        if (container.filename.startsWith(`${EPICS_DIR}/`) && !writes.has(container.filename)) {
          try {
            const raw = await fs.read(container.filename);
            preamble = textAboveFirstTask(raw) ?? raw;
          } catch {
            throw new StaleRepairEvidence(container.filename);
          }
        }
        const content =
          'slug' in container
            ? serializeRelease({ ...container, tasks }, true)
            : serializeBacklog({ ...container, preamble, tasks }, true);
        put(container.filename, content);
      }
      put(CONFIG_FILENAME, serializeConfig(config));
      const written = [...writes.values()];
      await fs.commit({
        ...ordinary,
        writes: written,
        verifyEvidence: async () => {
          await ordinary.verifyEvidence?.();
          const check = async (
            path: string,
            condition: () => Promise<boolean>,
            id?: string,
          ): Promise<void> => {
            try {
              if (await condition()) return;
            } catch {
              // A failed observation is just as unsafe as a changed value.
            }
            throw new StaleRepairEvidence(path, id);
          };
          for (const [path, expected] of evidence.versions)
            await check(
              path,
              async () => ((await fs.stat(path))?.lastModified ?? null) === expected,
            );
          for (const [path, expected] of evidence.directories)
            await check(path, async () => signature(await entriesIn(fs, path)) === expected);
          for (const { id, attachmentPath } of ready)
            await check(
              attachmentPath,
              async () =>
                !(await fs.list(attachmentPath)).some((entry) => !entry.isDirectory) &&
                !(await fs.list('attachments')).some(
                  (entry) => entry.name === id && !entry.isDirectory,
                ),
              id,
            );
          for (const [path, id] of newAttachmentPaths)
            await check(path, async () => (await fs.stat(path)) === null, id);
        },
      });
      if (onCommitted) {
        const next = applyOrdinaryDraft(draft, { ...ordinary, writes: written });
        const remaining = next.problems.filter((problem) => problem.duplicateTaskIds === undefined);
        onCommitted({
          ...next,
          problems: [...remaining, ...collectDuplicateProblems(next, sourceOf)],
        });
      }
      return repairs;
    } catch (error) {
      if (explicitId !== undefined) {
        const copies = all.get(explicitId) ?? [];
        throw new DuplicateIdRepairBlocked(explicitId, [
          duplicateTaskProblem(explicitId, copies),
          evidenceProblem(error),
        ]);
      }
      if (!(error instanceof StaleRepairEvidence)) throw error;
      ready = error.id === undefined ? [] : ready.filter((candidate) => candidate.id !== error.id);
    }
  }
  return withoutRepair();
};

// Opt in at the task mutation boundary, never on the generic board filesystem.
export const taskRepairFs = <F extends GuardedFs>(
  fs: F,
  snapshot: () => BoardSnapshot,
  onRepaired: (repairs: TaskIdRepair[], snapshot: BoardSnapshot) => void,
  sourceOf?: (task: Task) => string | undefined,
): F => {
  const hasDuplicates = (board: BoardSnapshot): boolean =>
    board.problems.some((problem) => problem.duplicateTaskIds !== undefined);
  const commit = async (change: GuardedChange): Promise<void> => {
    const board = snapshot();
    if (!hasDuplicates(board)) {
      await fs.commit(change);
      return;
    }
    let updated: BoardSnapshot | undefined;
    const repairs = await commitWithTaskIdRepairs(
      fs,
      board,
      change,
      undefined,
      sourceOf,
      (next) => {
        updated = next;
      },
    );
    if (updated) onRepaired(repairs, updated);
  };
  return {
    ...fs,
    commit,
    write: (path, content, expectedVersion) =>
      hasDuplicates(snapshot())
        ? commit({ writes: [{ path, content, expectedVersion }], removes: [] })
        : fs.write(path, content, expectedVersion),
    writeAll: (writes) => commit({ writes, removes: [] }),
  };
};
