import type {
  Backlog,
  BoardSnapshot,
  Epic,
  EpicPatch,
  FsAdapter,
  ParseProblem,
  Release,
  Task,
  TaskPatch,
  TaskStatus,
  TaskType,
  Theme,
} from '@boardown/core';
import {
  CONFIG_FILENAME,
  createRelease as createReleaseInBoard,
  createTask as createTaskInContainer,
  editEpic,
  editTask,
  loadBoard,
  moveTaskBetweenContainers,
  moveTaskInContainer,
  serializeBacklog,
  serializeConfig,
  serializeEpic,
  serializeRelease,
} from '@boardown/core';
import { create } from 'zustand';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ActiveTab = 'backlog' | 'board' | 'archive';

export interface CreateTaskInput {
  releaseFilename: string;
  title: string;
  description?: string;
  type: TaskType;
  epic?: string;
}

export interface CreateReleaseInput {
  name: string;
  description?: string;
}

interface BoardState {
  status: BoardStatus;
  snapshot: BoardSnapshot | null;
  problems: ParseProblem[];
  errorMessage: string | null;
  activeTab: ActiveTab;
  theme: Theme;
  fs: FsAdapter | null;
  selectedTaskId: string | null;
  selectedEpicSlug: string | null;
  createTaskForReleaseFilename: string | null;
  createReleaseOpen: boolean;
  settingsOpen: boolean;
  load: (fs: FsAdapter) => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  setTheme: (theme: Theme) => Promise<void>;
  openTask: (id: string) => void;
  closeTask: () => void;
  openEpic: (slug: string) => void;
  closeEpic: () => void;
  openCreateTask: (releaseFilename: string) => void;
  closeCreateTask: () => void;
  openCreateRelease: () => void;
  closeCreateRelease: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  createTask: (input: CreateTaskInput) => Promise<void>;
  createRelease: (input: CreateReleaseInput) => Promise<void>;
  updateTask: (taskId: string, patch: TaskPatch) => Promise<void>;
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
}

export type BacklogMoveTarget =
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

const formatProblems = (problems: ParseProblem[]): string =>
  problems.map((p) => `${p.file}: ${p.message}`).join('\n');

export const useBoardStore = create<BoardState>((set, get) => ({
  status: 'idle',
  snapshot: null,
  problems: [],
  errorMessage: null,
  activeTab: 'board',
  theme: 'light',
  fs: null,
  selectedTaskId: null,
  selectedEpicSlug: null,
  createTaskForReleaseFilename: null,
  createReleaseOpen: false,
  settingsOpen: false,

  load: async (fs) => {
    set({ status: 'loading', errorMessage: null, fs });
    try {
      const result = await loadBoard(fs);
      if (result.value === null) {
        set({
          status: 'error',
          snapshot: null,
          problems: result.problems,
          errorMessage: formatProblems(result.problems) || 'Failed to load board',
        });
        return;
      }
      set({
        status: 'ready',
        snapshot: result.value,
        problems: result.value.problems,
        errorMessage: null,
        theme: result.value.config.theme ?? 'light',
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

  openTask: (id) => set({ selectedTaskId: id, selectedEpicSlug: null }),

  closeTask: () => set({ selectedTaskId: null }),

  openEpic: (slug) => set({ selectedEpicSlug: slug, selectedTaskId: null }),

  closeEpic: () => set({ selectedEpicSlug: null }),

  openCreateTask: (releaseFilename) =>
    set({ createTaskForReleaseFilename: releaseFilename }),

  closeCreateTask: () => set({ createTaskForReleaseFilename: null }),

  openCreateRelease: () => set({ createReleaseOpen: true }),

  closeCreateRelease: () => set({ createReleaseOpen: false }),

  openSettings: () => set({ settingsOpen: true }),

  closeSettings: () => set({ settingsOpen: false }),

  createTask: async (input) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const releaseIndex = snapshot.releases.findIndex(
      (r) => r.filename === input.releaseFilename,
    );
    if (releaseIndex === -1) {
      set({ errorMessage: `Release not found: ${input.releaseFilename}` });
      return;
    }
    const release = snapshot.releases[releaseIndex]!;

    const result = createTaskInContainer(release, snapshot.config, {
      title: input.title,
      type: input.type,
      status: 'todo',
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.epic !== undefined ? { epic: input.epic } : {}),
    });

    const nextReleases = [...snapshot.releases];
    nextReleases[releaseIndex] = result.container;

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      config: result.config,
      releases: nextReleases,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      await fs.write(result.container.filename, serializeRelease(result.container));
      await fs.write(CONFIG_FILENAME, serializeConfig(result.config));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ snapshot, errorMessage: `Failed to save task: ${message}` });
      throw err;
    }
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

  updateTask: async (taskId, patch) => {
    const { snapshot, fs } = get();
    if (!snapshot || !fs) return;

    const releaseIndex = snapshot.releases.findIndex((r) =>
      r.tasks.some((t) => t.frontmatter.id === taskId),
    );
    if (releaseIndex !== -1) {
      const release = snapshot.releases[releaseIndex]!;
      const nextRelease = editTask(release, taskId, patch);
      const nextReleases = [...snapshot.releases];
      nextReleases[releaseIndex] = nextRelease;
      const nextSnapshot: BoardSnapshot = { ...snapshot, releases: nextReleases };
      set({ snapshot: nextSnapshot, errorMessage: null });
      try {
        await fs.write(nextRelease.filename, serializeRelease(nextRelease));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to save task: ${message}` });
        throw err;
      }
      return;
    }

    const epicIndex = snapshot.epics.findIndex((e) =>
      e.tasks.some((t) => t.frontmatter.id === taskId),
    );
    if (epicIndex !== -1) {
      const epic = snapshot.epics[epicIndex]!;
      const nextEpic = editTask(epic, taskId, patch);
      const nextEpics = [...snapshot.epics];
      nextEpics[epicIndex] = nextEpic;
      const nextSnapshot: BoardSnapshot = { ...snapshot, epics: nextEpics };
      set({ snapshot: nextSnapshot, errorMessage: null });
      try {
        await fs.write(nextEpic.filename, serializeEpic(nextEpic));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to save task: ${message}` });
        throw err;
      }
      return;
    }

    set({ errorMessage: `Task not found: ${taskId}` });
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

    let sourceKind: 'release' | 'epic' | null = null;
    let sourceIndex = -1;
    let task: Task | null = null;

    for (let i = 0; i < snapshot.releases.length; i++) {
      const found = snapshot.releases[i]!.tasks.find(
        (t) => t.frontmatter.id === taskId,
      );
      if (found) {
        sourceKind = 'release';
        sourceIndex = i;
        task = found;
        break;
      }
    }
    if (!task) {
      for (let i = 0; i < snapshot.epics.length; i++) {
        const found = snapshot.epics[i]!.tasks.find(
          (t) => t.frontmatter.id === taskId,
        );
        if (found) {
          sourceKind = 'epic';
          sourceIndex = i;
          task = found;
          break;
        }
      }
    }
    if (!task || sourceKind === null) {
      set({ errorMessage: `Task not found: ${taskId}` });
      return;
    }

    let destKind: 'release' | 'epic';
    let destIndex: number;

    if (targetReleaseFilename !== null) {
      destIndex = snapshot.releases.findIndex(
        (r) => r.filename === targetReleaseFilename,
      );
      if (destIndex === -1) {
        set({ errorMessage: `Release not found: ${targetReleaseFilename}` });
        return;
      }
      destKind = 'release';
    } else {
      const epicSlug = task.frontmatter.epic;
      if (!epicSlug) {
        set({
          errorMessage: 'Cannot remove release: task has no epic to fall back to',
        });
        return;
      }
      destIndex = snapshot.epics.findIndex((e) => e.slug === epicSlug);
      if (destIndex === -1) {
        set({ errorMessage: `Epic not found: ${epicSlug}` });
        return;
      }
      destKind = 'epic';
    }

    if (sourceKind === destKind && sourceIndex === destIndex) return;

    const source =
      sourceKind === 'release'
        ? snapshot.releases[sourceIndex]!
        : snapshot.epics[sourceIndex]!;
    const dest =
      destKind === 'release'
        ? snapshot.releases[destIndex]!
        : snapshot.epics[destIndex]!;

    const moved = moveTaskBetweenContainers(source, dest, taskId, {
      newStatus: task.frontmatter.status,
      beforeTaskId: null,
    });

    const nextReleases = [...snapshot.releases];
    const nextEpics = [...snapshot.epics];

    if (sourceKind === 'release') {
      nextReleases[sourceIndex] = moved.source as Release;
    } else {
      nextEpics[sourceIndex] = moved.source as Epic;
    }
    if (destKind === 'release') {
      nextReleases[destIndex] = moved.dest as Release;
    } else {
      nextEpics[destIndex] = moved.dest as Epic;
    }

    const nextSnapshot: BoardSnapshot = {
      ...snapshot,
      releases: nextReleases,
      epics: nextEpics,
    };
    set({ snapshot: nextSnapshot, errorMessage: null });

    try {
      if (sourceKind === 'release') {
        await fs.write(
          moved.source.filename,
          serializeRelease(moved.source as Release),
        );
      } else {
        await fs.write(
          moved.source.filename,
          serializeEpic(moved.source as Epic),
        );
      }
      if (destKind === 'release') {
        await fs.write(
          moved.dest.filename,
          serializeRelease(moved.dest as Release),
        );
      } else {
        await fs.write(moved.dest.filename, serializeEpic(moved.dest as Epic));
      }
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

    let destLoc: ContainerLocation;
    if (target.kind === 'release') {
      const index = snapshot.releases.findIndex(
        (r) => r.filename === target.filename,
      );
      if (index === -1) {
        set({ errorMessage: `Release not found: ${target.filename}` });
        return;
      }
      destLoc = {
        kind: 'release',
        index,
        container: snapshot.releases[index]!,
      };
    } else {
      const epicSlug = task.frontmatter.epic;
      if (epicSlug !== undefined) {
        const index = snapshot.epics.findIndex((e) => e.slug === epicSlug);
        if (index === -1) {
          set({ errorMessage: `Epic not found: ${epicSlug}` });
          return;
        }
        destLoc = {
          kind: 'epic',
          index,
          container: snapshot.epics[index]!,
        };
      } else {
        if (!snapshot.backlog) {
          set({ errorMessage: 'Backlog container is missing' });
          return;
        }
        destLoc = { kind: 'backlog', container: snapshot.backlog };
      }
    }

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
}));
