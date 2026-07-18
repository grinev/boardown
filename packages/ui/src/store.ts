import type {
  Backlog,
  BoardSnapshot,
  Container,
  DeleteTaskResult,
  DestEpic,
  Epic,
  EpicPatch,
  FsAdapter,
  GuardedFs,
  ParseProblem,
  Release,
  ReleasePatch,
  Task,
  TaskLinkResult,
  TaskPatch,
  TaskStatus,
  TaskType,
  Theme,
} from '@boardown/core';
import {
  CONFIG_FILENAME,
  addTaskLink as addTaskLinkInBoard,
  removeTaskLink as removeTaskLinkInBoard,
  completeRelease as completeReleaseInBoard,
  createEpic as createEpicInBoard,
  createRelease as createReleaseInBoard,
  createGuardedFs,
  createTask as createTaskInContainer,
  deleteTaskWithLinks,
  emptyBacklog,
  editEpic,
  editRelease,
  editTask,
  loadBoard,
  startRelease as startReleaseInBoard,
  moveTaskBetweenContainers,
  moveTaskInContainer,
  reorderTaskInBacklog,
  serializeBacklog,
  serializeConfig,
  serializeEpic,
  serializeRelease,
} from '@boardown/core';
import { create } from 'zustand';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error' | 'onboarding';

export type ActiveTab = 'backlog' | 'board' | 'archive';

export interface CreateTaskInput {
  // Empty/omitted means the task is created in the backlog: in the selected
  // epic's file when `epic` is set, otherwise in no_epic.md.
  releaseFilename?: string;
  title: string;
  description?: string;
  type: TaskType;
  epic?: string;
}

export interface CreateReleaseInput {
  name: string;
  description?: string;
}

export interface CreateEpicInput {
  name: string;
  description?: string;
  color: string;
}

export interface OnboardingInput {
  projectName: string;
  idPrefix: string;
}

interface BoardState {
  status: BoardStatus;
  snapshot: BoardSnapshot | null;
  problems: ParseProblem[];
  errorMessage: string | null;
  activeTab: ActiveTab;
  theme: Theme;
  // Host-provided fallback theme (e.g. VS Code's color theme), used only when
  // seeding a brand-new config at onboarding. Null when the shell omits it.
  defaultTheme: Theme | null;
  fs: GuardedFs | null;
  rawFs: FsAdapter | null;
  conflictOpen: boolean;
  selectedTaskId: string | null;
  selectedEpicSlug: string | null;
  selectedReleaseFilename: string | null;
  createTaskForReleaseFilename: string | null;
  createTaskOpen: boolean;
  createTaskBacklog: boolean;
  createReleaseOpen: boolean;
  createEpicOpen: boolean;
  completeReleaseOpen: boolean;
  startReleaseForFilename: string | null;
  settingsOpen: boolean;
  load: (fs: FsAdapter, defaultTheme?: Theme) => Promise<void>;
  reload: () => Promise<void>;
  reloadSilent: () => Promise<void>;
  closeConflict: () => void;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  setTheme: (theme: Theme) => Promise<void>;
  openTask: (id: string) => void;
  closeTask: () => void;
  openEpic: (slug: string) => void;
  closeEpic: () => void;
  openRelease: (filename: string) => void;
  closeRelease: () => void;
  openCreateTask: (releaseFilename: string) => void;
  openCreateTaskMenu: () => void;
  openCreateTaskBacklog: () => void;
  closeCreateTask: () => void;
  openCreateRelease: () => void;
  closeCreateRelease: () => void;
  openCreateEpic: () => void;
  closeCreateEpic: () => void;
  openCompleteRelease: () => void;
  closeCompleteRelease: () => void;
  completeRelease: (target: CompleteReleaseTarget) => Promise<void>;
  openStartRelease: (filename: string) => void;
  closeStartRelease: () => void;
  startRelease: (filename: string) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  createTask: (input: CreateTaskInput) => Promise<void>;
  createRelease: (input: CreateReleaseInput) => Promise<void>;
  createEpic: (input: CreateEpicInput) => Promise<void>;
  updateTask: (taskId: string, patch: TaskPatch) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (
    taskId: string,
    status: TaskStatus,
    beforeTaskId: string | null,
  ) => Promise<void>;
  moveTaskToRelease: (
    taskId: string,
    targetReleaseFilename: string | null,
  ) => Promise<void>;
  moveTaskOnBacklog: (
    taskId: string,
    target: BacklogMoveTarget,
    beforeTaskId: string | null,
  ) => Promise<void>;
  updateEpic: (slug: string, patch: EpicPatch) => Promise<void>;
  updateRelease: (filename: string, patch: ReleasePatch) => Promise<void>;
  addTaskLink: (taskId: string, otherTaskId: string) => Promise<void>;
  removeTaskLink: (taskId: string, otherTaskId: string) => Promise<void>;
}

export type BacklogMoveTarget =
  | { kind: 'release'; filename: string }
  | { kind: 'backlog' };

export type CompleteReleaseTarget =
  | { kind: 'release'; filename: string }
  | { kind: 'backlog' };

type ContainerLocation =
  | { kind: 'release'; index: number; container: Release }
  | { kind: 'epic'; index: number; container: Epic }
  | { kind: 'backlog'; container: Backlog };

const findTaskContainer = (
  snapshot: BoardSnapshot,
  taskId: string,
): { location: ContainerLocation; task: Task } | null => {
  for (let i = 0; i < snapshot.releases.length; i++) {
    const release = snapshot.releases[i]!;
    const task = release.tasks.find((t) => t.frontmatter.id === taskId);
    if (task) {
      return {
        location: { kind: 'release', index: i, container: release },
        task,
      };
    }
  }
  for (let i = 0; i < snapshot.epics.length; i++) {
    const epic = snapshot.epics[i]!;
    const task = epic.tasks.find((t) => t.frontmatter.id === taskId);
    if (task) {
      return {
        location: { kind: 'epic', index: i, container: epic },
        task,
      };
    }
  }
  if (snapshot.backlog) {
    const task = snapshot.backlog.tasks.find(
      (t) => t.frontmatter.id === taskId,
    );
    if (task) {
      return {
        location: { kind: 'backlog', container: snapshot.backlog },
        task,
      };
    }
  }
  return null;
};

const serializeContainer = (
  location: Pick<ContainerLocation, 'kind'> & { container: Release | Epic | Backlog },
): string => {
  switch (location.kind) {
    case 'release':
      return serializeRelease(location.container as Release);
    case 'epic':
      return serializeEpic(location.container as Epic);
    case 'backlog':
      return serializeBacklog(location.container as Backlog);
  }
};

const destEpicForLocation = (location: ContainerLocation): DestEpic => {
  switch (location.kind) {
    case 'release':
      return { kind: 'preserve' };
    case 'epic':
      return { kind: 'set', slug: location.container.slug };
    case 'backlog':
      return { kind: 'clear' };
  }
};

const formatProblems = (problems: ParseProblem[]): string =>
  problems.map((p) => `${p.file}: ${p.message}`).join('\n');

type LinkOp = (
  source: Release | Epic | Backlog,
  target: Release | Epic | Backlog,
  sourceTaskId: string,
  targetTaskId: string,
) => TaskLinkResult<Release | Epic | Backlog, Release | Epic | Backlog>;

// Adding and removing a link differ only in the core op: both mirror the change
// into the two tasks' containers (one container when they share a file) and write
// exactly the files the op reports as changed, together.
const applyLinkOp = async (
  snapshot: BoardSnapshot,
  fs: GuardedFs,
  taskId: string,
  otherTaskId: string,
  op: LinkOp,
  set: (partial: Partial<BoardState>) => void,
): Promise<void> => {
  const source = findTaskContainer(snapshot, taskId);
  const target = findTaskContainer(snapshot, otherTaskId);
  if (!source) {
    set({ errorMessage: `Task not found: ${taskId}` });
    return;
  }
  if (!target) {
    set({ errorMessage: `Task not found: ${otherTaskId}` });
    return;
  }

  let result: TaskLinkResult<Release | Epic | Backlog, Release | Epic | Backlog>;
  try {
    result = op(
      source.location.container,
      target.location.container,
      taskId,
      otherTaskId,
    );
  } catch (err) {
    set({ errorMessage: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (result.changedFilenames.length === 0) return;

  const nextReleases = [...snapshot.releases];
  const nextEpics = [...snapshot.epics];
  let nextBacklog = snapshot.backlog;
  const assign = (loc: ContainerLocation, value: Release | Epic | Backlog): void => {
    switch (loc.kind) {
      case 'release':
        nextReleases[loc.index] = value as Release;
        break;
      case 'epic':
        nextEpics[loc.index] = value as Epic;
        break;
      case 'backlog':
        nextBacklog = value as Backlog;
        break;
    }
  };
  assign(source.location, result.source);
  assign(target.location, result.target);

  const files = result.changedFilenames.map((filename) => {
    const fromSource = source.location.container.filename === filename;
    const location = fromSource ? source.location : target.location;
    const container = fromSource ? result.source : result.target;
    return {
      path: filename,
      content: serializeContainer({ kind: location.kind, container }),
    };
  });

  const nextSnapshot: BoardSnapshot = {
    ...snapshot,
    releases: nextReleases,
    epics: nextEpics,
    backlog: nextBacklog,
  };
  set({ snapshot: nextSnapshot, errorMessage: null });

  try {
    await fs.writeAll(files);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    set({ snapshot, errorMessage: `Failed to save link: ${message}` });
    throw err;
  }
};

export const useBoardStore = create<BoardState>((set, get) => ({
  status: 'idle',
  snapshot: null,
  problems: [],
  errorMessage: null,
  activeTab: 'board',
  theme: 'light',
  defaultTheme: null,
  fs: null,
  rawFs: null,
  conflictOpen: false,
  selectedTaskId: null,
  selectedEpicSlug: null,
  selectedReleaseFilename: null,
  createTaskForReleaseFilename: null,
  createTaskOpen: false,
  createTaskBacklog: false,
  createReleaseOpen: false,
  createEpicOpen: false,
  completeReleaseOpen: false,
  startReleaseForFilename: null,
  settingsOpen: false,

  load: async (fs, defaultTheme) => {
    set({
      status: 'loading',
      errorMessage: null,
      // Guarded with an empty version map until the board loads: the only write
      // possible before that is onboarding's config.yaml, which does not exist
      // yet, so the guard's stat check passes. Keeps `fs` a single type.
      fs: createGuardedFs(fs, {}, () => set({ conflictOpen: true })),
      rawFs: fs,
      conflictOpen: false,
      // Keep a previously captured default when the caller (e.g. reload) omits it.
      // Seed `theme` from it too so the loading screen matches the host theme
      // (e.g. VS Code dark) instead of flashing the light-theme default before
      // config is read; config.theme still wins once the board loads below.
      ...(defaultTheme !== undefined ? { defaultTheme, theme: defaultTheme } : {}),
    });
    try {
      const result = await loadBoard(fs);
      if (result.kind === 'missing-config') {
        set({
          status: 'onboarding',
          snapshot: null,
          problems: [],
          errorMessage: null,
          theme: get().defaultTheme ?? 'light',
        });
        return;
      }
      if (result.kind === 'failed') {
        set({
          status: 'error',
          snapshot: null,
          problems: result.problems,
          errorMessage: formatProblems(result.problems) || 'Failed to load board',
        });
        return;
      }
      // From here on writes go through a guard that refuses to clobber files
      // changed on disk since this load, surfacing the conflict modal instead.
      const guarded = createGuardedFs(fs, result.fileVersions, () =>
        set({ conflictOpen: true }),
      );
      set({
        status: 'ready',
        fs: guarded,
        snapshot: result.snapshot,
        problems: result.snapshot.problems,
        errorMessage: null,
        conflictOpen: false,
        theme: result.snapshot.config.theme ?? 'light',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        snapshot: null,
        problems: [],
        errorMessage: message,
      });
    }
  },

  reload: async () => {
    const { rawFs } = get();
    if (rawFs) await get().load(rawFs);
  },

  // Re-read the board and swap it in place without flipping status to
  // 'loading', so an external change (git, the CLI, another editor) refreshes
  // the view without flashing the loading screen. Only valid once a board is
  // shown: outside 'ready', or when the board became invalid/absent on disk,
  // fall back to the visible load() path — there a real problem should surface
  // rather than silently keeping stale data.
  reloadSilent: async () => {
    const { rawFs, status } = get();
    if (!rawFs) return;
    if (status !== 'ready') {
      await get().load(rawFs);
      return;
    }
    try {
      const result = await loadBoard(rawFs);
      if (result.kind !== 'loaded') {
        await get().load(rawFs);
        return;
      }
      const guarded = createGuardedFs(rawFs, result.fileVersions, () =>
        set({ conflictOpen: true }),
      );
      set({
        fs: guarded,
        snapshot: result.snapshot,
        problems: result.snapshot.problems,
        errorMessage: null,
        conflictOpen: false,
        theme: result.snapshot.config.theme ?? 'light',
      });
    } catch {
      await get().load(rawFs);
    }
  },

  closeConflict: () => set({ conflictOpen: false }),

  completeOnboarding: async (input) => {
    const { fs } = get();
    if (!fs) {
      throw new Error('Filesystem adapter is not initialized');
    }
    const dt = get().defaultTheme;
    const config = {
      idPrefix: input.idPrefix,
      nextId: 1,
      projectName: input.projectName,
      ...(dt ? { theme: dt } : {}),
    };
    await fs.write(CONFIG_FILENAME, serializeConfig(config));
    await get().load(fs);
    // A freshly created board has no releases yet, so land on the Backlog tab
    // instead of the empty Board.
    set({ activeTab: 'backlog' });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTheme: async (next) => {
    const { snapshot, fs, theme: previous } = get();
    if (!snapshot || !fs) return;
    if (next === previous) return;
    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      config: { ...snapshot.config, theme: next },
    };
    set({ theme: next, snapshot: nextSnapshot, errorMessage: null });
    try {
      await fs.write(CONFIG_FILENAME, serializeConfig(nextSnapshot.config));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ theme: previous, snapshot, errorMessage: `Failed to save theme: ${message}` });
    }
  },

  openTask: (id) =>
    set({
      selectedTaskId: id,
      selectedEpicSlug: null,
      selectedReleaseFilename: null,
    }),

  closeTask: () => set({ selectedTaskId: null }),

  openEpic: (slug) =>
    set({
      selectedEpicSlug: slug,
      selectedTaskId: null,
      selectedReleaseFilename: null,
    }),

  closeEpic: () => set({ selectedEpicSlug: null }),

  openRelease: (filename) =>
    set({
      selectedReleaseFilename: filename,
      selectedTaskId: null,
      selectedEpicSlug: null,
    }),

  closeRelease: () => set({ selectedReleaseFilename: null }),

  openCreateTask: (releaseFilename) =>
    set({ createTaskForReleaseFilename: releaseFilename }),

  openCreateTaskMenu: () => set({ createTaskOpen: true }),

  openCreateTaskBacklog: () => set({ createTaskBacklog: true }),

  closeCreateTask: () =>
    set({
      createTaskForReleaseFilename: null,
      createTaskOpen: false,
      createTaskBacklog: false,
    }),

  openCreateRelease: () => set({ createReleaseOpen: true }),

  closeCreateRelease: () => set({ createReleaseOpen: false }),

  openCreateEpic: () => set({ createEpicOpen: true }),

  closeCreateEpic: () => set({ createEpicOpen: false }),

  openCompleteRelease: () => set({ completeReleaseOpen: true }),

  closeCompleteRelease: () => set({ completeReleaseOpen: false }),

  openStartRelease: (filename) => set({ startReleaseForFilename: filename }),

  closeStartRelease: () => set({ startReleaseForFilename: null }),

  openSettings: () => set({ settingsOpen: true }),

  closeSettings: () => set({ settingsOpen: false }),

  createTask: async (input) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const baseInput = {
      title: input.title,
      type: input.type,
      status: 'todo' as const,
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    const persist = async (
      nextSnapshot: BoardSnapshot,
      filename: string,
      content: string,
      config: typeof snapshot.config,
    ) => {
      set({ snapshot: nextSnapshot, errorMessage: null });
      try {
        await fs.write(filename, content);
        await fs.write(CONFIG_FILENAME, serializeConfig(config));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to save task: ${message}` });
        throw err;
      }
    };

    // Task bound to a release: the epic, if any, is kept as a frontmatter link.
    if (input.releaseFilename) {
      const releaseIndex = snapshot.releases.findIndex(
        (r) => r.filename === input.releaseFilename,
      );
      if (releaseIndex === -1) {
        set({ errorMessage: `Release not found: ${input.releaseFilename}` });
        return;
      }
      const release = snapshot.releases[releaseIndex]!;
      const result = createTaskInContainer(release, snapshot.config, {
        ...baseInput,
        ...(input.epic !== undefined ? { epic: input.epic } : {}),
      });
      const nextReleases = [...snapshot.releases];
      nextReleases[releaseIndex] = result.container;
      await persist(
        { ...snapshot, config: result.config, releases: nextReleases },
        result.container.filename,
        serializeRelease(result.container),
        result.config,
      );
      return;
    }

    // No release, epic selected: the task lives in the epic's file. The epic
    // link is implied by the filename, so it is omitted from the frontmatter.
    if (input.epic) {
      const epicIndex = snapshot.epics.findIndex((e) => e.slug === input.epic);
      if (epicIndex === -1) {
        set({ errorMessage: `Epic not found: ${input.epic}` });
        return;
      }
      const epic = snapshot.epics[epicIndex]!;
      const result = createTaskInContainer(epic, snapshot.config, {
        ...baseInput,
        epic: input.epic,
      });
      const nextEpics = [...snapshot.epics];
      nextEpics[epicIndex] = result.container;
      await persist(
        { ...snapshot, config: result.config, epics: nextEpics },
        result.container.filename,
        serializeEpic(result.container),
        result.config,
      );
      return;
    }

    // No release, no epic: the task goes to the backlog (no_epic.md). The file
    // may not exist yet on a fresh board — create it lazily on first task.
    const backlog = snapshot.backlog ?? emptyBacklog();
    const result = createTaskInContainer(backlog, snapshot.config, baseInput);
    await persist(
      { ...snapshot, config: result.config, backlog: result.container },
      result.container.filename,
      serializeBacklog(result.container),
      result.config,
    );
  },

  createRelease: async (input) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const release = createReleaseInBoard(snapshot.releases, {
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: [...snapshot.releases, release],
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(release.filename, serializeRelease(release));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save release: ${message}` });
      throw err;
    }
  },

  createEpic: async (input) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const epic = createEpicInBoard(snapshot.epics, {
      name: input.name,
      color: input.color,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      epics: [...snapshot.epics, epic],
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(epic.filename, serializeEpic(epic));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save epic: ${message}` });
      throw err;
    }
  },

  completeRelease: async (target) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const releaseIndex = snapshot.releases.findIndex(
      (r) => r.frontmatter.status === 'current',
    );
    if (releaseIndex === -1) {
      set({ errorMessage: 'No current release to complete' });
      return;
    }

    let targetReleaseIndex = -1;
    if (target.kind === 'release') {
      targetReleaseIndex = snapshot.releases.findIndex(
        (r) => r.filename === target.filename,
      );
      if (targetReleaseIndex === -1) {
        set({ errorMessage: `Release not found: ${target.filename}` });
        return;
      }
    }

    const result = completeReleaseInBoard({
      release: snapshot.releases[releaseIndex]!,
      epics: snapshot.epics,
      // Leftover epic-less tasks fall back to the backlog; create it lazily so
      // completing a release works on a board without no_epic.md yet.
      backlog:
        target.kind === 'backlog'
          ? (snapshot.backlog ?? emptyBacklog())
          : snapshot.backlog,
      targetRelease:
        targetReleaseIndex === -1
          ? null
          : snapshot.releases[targetReleaseIndex]!,
    });

    const nextReleases = [...snapshot.releases];
    nextReleases[releaseIndex] = result.release;
    if (targetReleaseIndex !== -1 && result.targetRelease) {
      nextReleases[targetReleaseIndex] = result.targetRelease;
    }

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: nextReleases,
      epics: result.epics,
      backlog: result.backlog,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      for (const filename of result.changedFilenames) {
        const release = nextSnapshot.releases.find((r) => r.filename === filename);
        if (release) {
          await fs.write(filename, serializeRelease(release));
          continue;
        }
        const epic = nextSnapshot.epics.find((e) => e.filename === filename);
        if (epic) {
          await fs.write(filename, serializeEpic(epic));
          continue;
        }
        if (nextSnapshot.backlog && nextSnapshot.backlog.filename === filename) {
          await fs.write(filename, serializeBacklog(nextSnapshot.backlog));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to complete release: ${message}` });
      throw err;
    }
  },

  startRelease: async (filename) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const releaseIndex = snapshot.releases.findIndex(
      (r) => r.filename === filename,
    );
    if (releaseIndex === -1) {
      set({ errorMessage: `Release not found: ${filename}` });
      return;
    }

    const started = startReleaseInBoard(
      snapshot.releases[releaseIndex]!,
      snapshot.releases,
    );

    const nextReleases = [...snapshot.releases];
    nextReleases[releaseIndex] = started;
    const nextSnapshot: BoardSnapshot = { ...snapshot, releases: nextReleases };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(started.filename, serializeRelease(started));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to start release: ${message}` });
      throw err;
    }
  },

  updateTask: async (taskId, patch) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const found = findTaskContainer(snapshot, taskId);
    if (!found) {
      set({ errorMessage: `Task not found: ${taskId}` });
      return;
    }
    const { location: sourceLoc, task } = found;

    const currentEpic = task.frontmatter.epic;
    const epicChanges =
      patch.epic !== undefined &&
      ((patch.epic === null && currentEpic !== undefined) ||
        (typeof patch.epic === 'string' && patch.epic !== currentEpic));
    const needsRelocation = epicChanges && sourceLoc.kind !== 'release';

    if (needsRelocation) {
      let destLoc: ContainerLocation;
      if (patch.epic === null) {
        if (!snapshot.backlog) {
          set({ errorMessage: 'Backlog container is missing' });
          return;
        }
        destLoc = { kind: 'backlog', container: snapshot.backlog };
      } else {
        const slug = patch.epic as string;
        const index = snapshot.epics.findIndex((e) => e.slug === slug);
        if (index === -1) {
          set({ errorMessage: `Epic not found: ${slug}` });
          return;
        }
        destLoc = { kind: 'epic', index, container: snapshot.epics[index]! };
      }

      const moved = moveTaskBetweenContainers(
        sourceLoc.container,
        destLoc.container,
        taskId,
        {
          newStatus: task.frontmatter.status,
          beforeTaskId: null,
          destEpic: destEpicForLocation(destLoc),
        },
      );

      const remainderPatch: TaskPatch = { ...patch };
      delete remainderPatch.epic;
      const destWithRemainder =
        remainderPatch.title !== undefined ||
        remainderPatch.description !== undefined ||
        remainderPatch.type !== undefined ||
        remainderPatch.status !== undefined
          ? editTask(moved.dest, taskId, remainderPatch)
          : moved.dest;

      const nextReleases = [...snapshot.releases];
      const nextEpics = [...snapshot.epics];
      let nextBacklog = snapshot.backlog;

      const assign = (
        loc: ContainerLocation,
        value: Release | Epic | Backlog,
      ): void => {
        switch (loc.kind) {
          case 'release':
            nextReleases[loc.index] = value as Release;
            break;
          case 'epic':
            nextEpics[loc.index] = value as Epic;
            break;
          case 'backlog':
            nextBacklog = value as Backlog;
            break;
        }
      };

      assign(sourceLoc, moved.source);
      assign(destLoc, destWithRemainder);

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        releases: nextReleases,
        epics: nextEpics,
        backlog: nextBacklog,
      };
      set({ snapshot: nextSnapshot, errorMessage: null });

      try {
        await fs.write(
          moved.source.filename,
          serializeContainer({ kind: sourceLoc.kind, container: moved.source }),
        );
        await fs.write(
          destWithRemainder.filename,
          serializeContainer({ kind: destLoc.kind, container: destWithRemainder }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to save task: ${message}` });
        throw err;
      }
      return;
    }

    const nextContainer = editTask(sourceLoc.container, taskId, patch);
    const nextReleases = [...snapshot.releases];
    const nextEpics = [...snapshot.epics];
    let nextBacklog = snapshot.backlog;

    switch (sourceLoc.kind) {
      case 'release':
        nextReleases[sourceLoc.index] = nextContainer as Release;
        break;
      case 'epic':
        nextEpics[sourceLoc.index] = nextContainer as Epic;
        break;
      case 'backlog':
        nextBacklog = nextContainer as Backlog;
        break;
    }

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: nextReleases,
      epics: nextEpics,
      backlog: nextBacklog,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(
        nextContainer.filename,
        serializeContainer({ kind: sourceLoc.kind, container: nextContainer }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save task: ${message}` });
      throw err;
    }
  },

  moveTask: async (taskId, status, beforeTaskId) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const releaseIndex = snapshot.releases.findIndex((r) =>
      r.tasks.some((t) => t.frontmatter.id === taskId),
    );
    if (releaseIndex !== -1) {
      const release = snapshot.releases[releaseIndex]!;
      const nextRelease = moveTaskInContainer(release, taskId, {
        status,
        beforeTaskId,
      });
      const nextReleases = [...snapshot.releases];
      nextReleases[releaseIndex] = nextRelease;
      const nextSnapshot: BoardSnapshot = { ...snapshot, releases: nextReleases };
      set({ snapshot: nextSnapshot, errorMessage: null });
      try {
        await fs.write(nextRelease.filename, serializeRelease(nextRelease));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to move task: ${message}` });
        throw err;
      }
      return;
    }

    const epicIndex = snapshot.epics.findIndex((e) =>
      e.tasks.some((t) => t.frontmatter.id === taskId),
    );
    if (epicIndex !== -1) {
      const epic = snapshot.epics[epicIndex]!;
      const nextEpic = moveTaskInContainer(epic, taskId, {
        status,
        beforeTaskId,
      });
      const nextEpics = [...snapshot.epics];
      nextEpics[epicIndex] = nextEpic;
      const nextSnapshot: BoardSnapshot = { ...snapshot, epics: nextEpics };
      set({ snapshot: nextSnapshot, errorMessage: null });
      try {
        await fs.write(nextEpic.filename, serializeEpic(nextEpic));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to move task: ${message}` });
        throw err;
      }
      return;
    }

    set({ errorMessage: `Task not found: ${taskId}` });
  },

  moveTaskToRelease: async (taskId, targetReleaseFilename) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const found = findTaskContainer(snapshot, taskId);
    if (!found) {
      set({ errorMessage: `Task not found: ${taskId}` });
      return;
    }
    const { location: sourceLoc, task } = found;

    let destLoc: ContainerLocation;
    if (targetReleaseFilename !== null) {
      const index = snapshot.releases.findIndex(
        (r) => r.filename === targetReleaseFilename,
      );
      if (index === -1) {
        set({ errorMessage: `Release not found: ${targetReleaseFilename}` });
        return;
      }
      destLoc = { kind: 'release', index, container: snapshot.releases[index]! };
    } else {
      // Removing the release: a task with an epic falls back to that epic's
      // file, an epic-less task to the backlog (no_epic.md, created lazily).
      const epicSlug = task.frontmatter.epic;
      if (epicSlug !== undefined) {
        const index = snapshot.epics.findIndex((e) => e.slug === epicSlug);
        if (index === -1) {
          set({ errorMessage: `Epic not found: ${epicSlug}` });
          return;
        }
        destLoc = { kind: 'epic', index, container: snapshot.epics[index]! };
      } else {
        destLoc = {
          kind: 'backlog',
          container: snapshot.backlog ?? emptyBacklog(),
        };
      }
    }

    if (sourceLoc.container.filename === destLoc.container.filename) return;

    const moved = moveTaskBetweenContainers(
      sourceLoc.container,
      destLoc.container,
      taskId,
      {
        newStatus: task.frontmatter.status,
        beforeTaskId: null,
        destEpic: destEpicForLocation(destLoc),
      },
    );

    const nextReleases = [...snapshot.releases];
    const nextEpics = [...snapshot.epics];
    let nextBacklog = snapshot.backlog;
    const assign = (
      loc: ContainerLocation,
      value: Release | Epic | Backlog,
    ): void => {
      switch (loc.kind) {
        case 'release':
          nextReleases[loc.index] = value as Release;
          break;
        case 'epic':
          nextEpics[loc.index] = value as Epic;
          break;
        case 'backlog':
          nextBacklog = value as Backlog;
          break;
      }
    };
    assign(sourceLoc, moved.source);
    assign(destLoc, moved.dest);

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: nextReleases,
      epics: nextEpics,
      backlog: nextBacklog,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(
        moved.source.filename,
        serializeContainer({ kind: sourceLoc.kind, container: moved.source }),
      );
      await fs.write(
        moved.dest.filename,
        serializeContainer({ kind: destLoc.kind, container: moved.dest }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to move task: ${message}` });
      throw err;
    }
  },

  moveTaskOnBacklog: async (taskId, target, beforeTaskId) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const found = findTaskContainer(snapshot, taskId);
    if (!found) {
      set({ errorMessage: `Task not found: ${taskId}` });
      return;
    }
    const { location: sourceLoc, task } = found;

    if (target.kind === 'release') {
      const index = snapshot.releases.findIndex(
        (r) => r.filename === target.filename,
      );
      if (index === -1) {
        set({ errorMessage: `Release not found: ${target.filename}` });
        return;
      }
      const destLoc: ContainerLocation = {
        kind: 'release',
        index,
        container: snapshot.releases[index]!,
      };

      const sameContainer =
        sourceLoc.kind === destLoc.kind &&
        sourceLoc.container.filename === destLoc.container.filename;

      let nextSource: Release | Epic | Backlog;
      let nextDest: Release | Epic | Backlog;

      if (sameContainer) {
        const updated = moveTaskInContainer(sourceLoc.container, taskId, {
          status: task.frontmatter.status,
          beforeTaskId,
        });
        nextSource = updated;
        nextDest = updated;
      } else {
        const moved = moveTaskBetweenContainers(
          sourceLoc.container,
          destLoc.container,
          taskId,
          {
            newStatus: task.frontmatter.status,
            beforeTaskId,
            destEpic: destEpicForLocation(destLoc),
          },
        );
        nextSource = moved.source;
        nextDest = moved.dest;
      }

      const nextReleases = [...snapshot.releases];
      const nextEpics = [...snapshot.epics];
      let nextBacklog = snapshot.backlog;
      const assign = (
        loc: ContainerLocation,
        value: Release | Epic | Backlog,
      ): void => {
        switch (loc.kind) {
          case 'release':
            nextReleases[loc.index] = value as Release;
            break;
          case 'epic':
            nextEpics[loc.index] = value as Epic;
            break;
          case 'backlog':
            nextBacklog = value as Backlog;
            break;
        }
      };
      assign(sourceLoc, nextSource);
      if (!sameContainer) assign(destLoc, nextDest);

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        releases: nextReleases,
        epics: nextEpics,
        backlog: nextBacklog,
      };
      set({ snapshot: nextSnapshot, errorMessage: null });

      try {
        await fs.write(
          nextSource.filename,
          serializeContainer({ kind: sourceLoc.kind, container: nextSource }),
        );
        if (!sameContainer) {
          await fs.write(
            nextDest.filename,
            serializeContainer({ kind: destLoc.kind, container: nextDest }),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to move task: ${message}` });
        throw err;
      }
      return;
    }

    // target.kind === 'backlog': pure global reorder of the flat backlog
    // list, or move-from-release-into-backlog followed by such reorder.
    let workingSnapshot = snapshot;
    let releaseWritebackFilename: string | null = null;
    let releaseWritebackContent: string | null = null;

    if (sourceLoc.kind === 'release') {
      const epicSlug = task.frontmatter.epic;
      let movedSource: Release;
      let nextEpics = snapshot.epics;
      let nextBacklog = snapshot.backlog;

      if (epicSlug !== undefined) {
        const epicIdx = snapshot.epics.findIndex((e) => e.slug === epicSlug);
        if (epicIdx === -1) {
          set({ errorMessage: `Epic not found: ${epicSlug}` });
          return;
        }
        const destEpic = snapshot.epics[epicIdx]!;
        const moved = moveTaskBetweenContainers(
          sourceLoc.container,
          destEpic,
          taskId,
          {
            newStatus: task.frontmatter.status,
            beforeTaskId: null,
            destEpic: { kind: 'set', slug: destEpic.slug },
          },
        );
        movedSource = moved.source;
        nextEpics = [...snapshot.epics];
        nextEpics[epicIdx] = moved.dest;
      } else {
        if (!snapshot.backlog) {
          set({ errorMessage: 'Backlog container (no_epic.md) is missing' });
          return;
        }
        const moved = moveTaskBetweenContainers(
          sourceLoc.container,
          snapshot.backlog,
          taskId,
          {
            newStatus: task.frontmatter.status,
            beforeTaskId: null,
            destEpic: { kind: 'clear' },
          },
        );
        movedSource = moved.source;
        nextBacklog = moved.dest;
      }

      const nextReleases = [...snapshot.releases];
      nextReleases[sourceLoc.index] = movedSource;
      releaseWritebackFilename = movedSource.filename;
      releaseWritebackContent = serializeRelease(movedSource);

      workingSnapshot = {
        ...snapshot,
        releases: nextReleases,
        epics: nextEpics,
        backlog: nextBacklog,
      };
    }

    const reordered = reorderTaskInBacklog(
      { epics: workingSnapshot.epics, backlog: workingSnapshot.backlog },
      taskId,
      beforeTaskId,
    );

    const nextSnapshot: BoardSnapshot = {
      ...workingSnapshot,
      epics: reordered.epics,
      backlog: reordered.backlog,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      if (releaseWritebackFilename && releaseWritebackContent) {
        await fs.write(releaseWritebackFilename, releaseWritebackContent);
      }
      for (const filename of reordered.changedFilenames) {
        const epic = nextSnapshot.epics.find((e) => e.filename === filename);
        if (epic) {
          await fs.write(filename, serializeEpic(epic));
          continue;
        }
        if (nextSnapshot.backlog && nextSnapshot.backlog.filename === filename) {
          await fs.write(filename, serializeBacklog(nextSnapshot.backlog));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to move task: ${message}` });
      throw err;
    }
  },

  addTaskLink: async (taskId, otherTaskId) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;
    await applyLinkOp(snapshot, fs, taskId, otherTaskId, addTaskLinkInBoard, set);
  },

  removeTaskLink: async (taskId, otherTaskId) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;
    await applyLinkOp(snapshot, fs, taskId, otherTaskId, removeTaskLinkInBoard, set);
  },

  deleteTask: async (taskId) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const backlog = snapshot.backlog;
    const containers: Container[] = [
      ...snapshot.releases,
      ...snapshot.epics,
      ...(backlog ? [backlog] : []),
    ];

    let result: DeleteTaskResult;
    try {
      result = deleteTaskWithLinks(containers, taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ errorMessage: message });
      throw err;
    }

    const releaseCount = snapshot.releases.length;
    const epicCount = snapshot.epics.length;
    const nextReleases = result.containers.slice(0, releaseCount) as Release[];
    const nextEpics = result.containers.slice(
      releaseCount,
      releaseCount + epicCount,
    ) as Epic[];
    const nextBacklog = backlog
      ? (result.containers[releaseCount + epicCount] as Backlog)
      : null;

    const kindOf = (index: number): ContainerLocation['kind'] =>
      index < releaseCount
        ? 'release'
        : index < releaseCount + epicCount
          ? 'epic'
          : 'backlog';

    const files = result.changedFilenames.map((filename) => {
      const index = result.containers.findIndex((c) => c.filename === filename);
      const container = result.containers[index]!;
      return {
        path: filename,
        content: serializeContainer({ kind: kindOf(index), container }),
      };
    });

    // Unlike the other mutations this one writes first: dropping the task from the
    // snapshot unmounts its dialog, and with it the confirm dialog that would have
    // shown a failed write. A refused delete must leave the user where they were.
    try {
      await fs.writeAll(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ errorMessage: `Failed to delete task: ${message}` });
      throw err;
    }

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: nextReleases,
      epics: nextEpics,
      backlog: nextBacklog,
    };
    set({ snapshot: nextSnapshot, errorMessage: null, selectedTaskId: null });
  },

  updateEpic: async (slug, patch) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const epicIndex = snapshot.epics.findIndex((e) => e.slug === slug);
    if (epicIndex === -1) {
      set({ errorMessage: `Epic not found: ${slug}` });
      return;
    }
    const epic = snapshot.epics[epicIndex]!;
    const nextEpic = editEpic(epic, patch);
    const nextEpics = [...snapshot.epics];
    nextEpics[epicIndex] = nextEpic;
    const nextSnapshot: BoardSnapshot = { ...snapshot, epics: nextEpics };
    set({ snapshot: nextSnapshot, errorMessage: null });
    try {
      await fs.write(nextEpic.filename, serializeEpic(nextEpic));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save epic: ${message}` });
      throw err;
    }
  },

  updateRelease: async (filename, patch) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const index = snapshot.releases.findIndex((r) => r.filename === filename);
    if (index === -1) {
      set({ errorMessage: `Release not found: ${filename}` });
      return;
    }
    const nextRelease = editRelease(snapshot.releases[index]!, patch);
    const nextReleases = [...snapshot.releases];
    nextReleases[index] = nextRelease;
    const nextSnapshot: BoardSnapshot = { ...snapshot, releases: nextReleases };
    set({ snapshot: nextSnapshot, errorMessage: null });
    try {
      await fs.write(nextRelease.filename, serializeRelease(nextRelease));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save release: ${message}` });
      throw err;
    }
  },
}));
