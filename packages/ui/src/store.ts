import type {
  BoardSnapshot,
  EpicPatch,
  FsAdapter,
  ParseProblem,
  TaskPatch,
  TaskType,
  Theme,
} from '@boardown/core';
import {
  CONFIG_FILENAME,
  createTask as createTaskInContainer,
  editEpic,
  editTask,
  loadBoard,
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
  openSettings: () => void;
  closeSettings: () => void;
  createTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (taskId: string, patch: TaskPatch) => Promise<void>;
  updateEpic: (slug: string, patch: EpicPatch) => Promise<void>;
}

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
