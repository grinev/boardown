import type {
  Backlog,
  BoardSnapshot,
  Container,
  DeleteTaskResult,
  DestEpic,
  DocPage,
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
  addDocFolder,
  addDocPage,
  createGuardedFs,
  createLogger,
  createTask as createTaskInContainer,
  docFilenameForTitle,
  docPagePath,
  findDocFolder,
  findDocPage,
  isDocFolderEmpty,
  deleteTaskWithLinks,
  emptyBacklog,
  editEpic,
  editRelease,
  editTask,
  loadBoard,
  startRelease as startReleaseInBoard,
  moveTaskBetweenContainers,
  moveTaskInContainer,
  removeDocFolder,
  removeDocPage,
  reorderTaskInBacklog,
  replaceDocPage,
  serializeBacklog,
  serializeDocPage,
  targetDocFolder,
  serializeConfig,
  serializeEpic,
  serializeRelease,
} from '@boardown/core';
import { create, type StateCreator } from 'zustand';
import { findTaskById } from './utils/find-task';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error' | 'onboarding';

export type ActiveTab = 'backlog' | 'board' | 'archive' | 'docs';

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

// One entry of the dialog history: which of the four detail dialogs was open and
// what it was showing. Only identifiers are kept — the entity is re-resolved on
// the way back, so an edit made in between is visible.
export type DialogRef =
  | { kind: 'task'; id: string }
  | { kind: 'epic'; slug: string }
  | { kind: 'release'; filename: string }
  | { kind: 'doc'; path: string };

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
  // The doc page shown in the read-only popup; a peer of the entity selections
  // above in the single-dialog invariant (only one dialog is open at a time).
  docPopupPath: string | null;
  // Dialogs navigated away from, oldest first. Still one dialog on screen — this
  // is history, not a pile of windows. Back only; there is no forward.
  dialogStack: DialogRef[];
  createTaskForReleaseFilename: string | null;
  createTaskForEpicSlug: string | null;
  createTaskOpen: boolean;
  createTaskBacklog: boolean;
  createReleaseOpen: boolean;
  createEpicOpen: boolean;
  completeReleaseOpen: boolean;
  startReleaseForFilename: string | null;
  settingsOpen: boolean;
  // Docs: the selected tree node (a page path or a folder path), plus the
  // dialogs the tab owns.
  selectedDocPath: string | null;
  createDocPageOpen: boolean;
  createDocFolderOpen: boolean;
  deleteDocPath: string | null;
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
  goBack: () => void;
  openCreateTask: (releaseFilename: string) => void;
  openCreateTaskForEpic: (slug: string) => void;
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
  selectDoc: (path: string | null) => void;
  openDocPage: (path: string) => void;
  openDocPopup: (path: string) => void;
  closeDocPopup: () => void;
  openCreateDocPage: () => void;
  closeCreateDocPage: () => void;
  openCreateDocFolder: () => void;
  closeCreateDocFolder: () => void;
  openDeleteDoc: (path: string) => void;
  closeDeleteDoc: () => void;
  createDocPage: (title: string) => Promise<void>;
  createDocFolder: (name: string) => Promise<void>;
  saveDocPage: (path: string, title: string, body: string) => Promise<void>;
  deleteDocPage: (path: string) => Promise<void>;
  deleteDocFolder: (path: string) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  createRelease: (input: CreateReleaseInput) => Promise<void>;
  createEpic: (input: CreateEpicInput) => Promise<void>;
  updateTask: (taskId: string, patch: TaskPatch) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, status: TaskStatus, beforeTaskId: string | null) => Promise<void>;
  moveTaskToRelease: (taskId: string, targetReleaseFilename: string | null) => Promise<void>;
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

export type BacklogMoveTarget = { kind: 'release'; filename: string } | { kind: 'backlog' };

export type CompleteReleaseTarget = { kind: 'release'; filename: string } | { kind: 'backlog' };

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
    const task = snapshot.backlog.tasks.find((t) => t.frontmatter.id === taskId);
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
    result = op(source.location.container, target.location.container, taskId, otherTaskId);
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

const log = createLogger('ui.store');

// Arguments are for reading a trail, not for reconstructing state: keep each one
// short and never let a value that resists serialization break the call.
const describeArg = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') return typeof value;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return '…';
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return '…';
  }
};

// Every action the user triggers goes through a function on the store, so
// wrapping them at creation gives the trail that makes an error further down the
// file readable — without an added log call in each of the ~40 actions.
const withActionLogging = (state: BoardState): BoardState => {
  const wrapped = Object.entries(state).map(([name, value]) => {
    if (typeof value !== 'function') return [name, value] as const;
    const action = value as (...args: unknown[]) => unknown;
    return [
      name,
      (...args: unknown[]) => {
        log.info(`${name}(${args.map(describeArg).join(', ')})`);
        return action(...args);
      },
    ] as const;
  });
  // The mapping preserves every key and only changes function identity, which
  // the BoardState type cannot express.
  return Object.fromEntries(wrapped) as BoardState;
};

// Single instrumentation point: every failure in this store surfaces by setting
// errorMessage, so logging that transition covers all of them — including call
// sites added later — without touching each catch block.
const logErrors =
  (creator: StateCreator<BoardState>): StateCreator<BoardState> =>
  (set, get, api) => {
    const loggingSet: typeof set = (partial, replace) => {
      const message =
        typeof partial === 'object' && partial !== null && 'errorMessage' in partial
          ? partial.errorMessage
          : null;
      if (typeof message === 'string' && message !== '') log.error(message);
      (set as (p: typeof partial, r?: boolean) => void)(partial, replace);
    };
    return withActionLogging(creator(loggingSet, get, api));
  };

// The four detail dialogs are mutually exclusive, so "which one is open" is a
// single value. A modal blocks the view underneath, which makes "a dialog is
// already open" equivalent to "this open came from another dialog" — that is what
// lets the openers push history without every call site saying so.
const currentDialog = (state: BoardState): DialogRef | null => {
  if (state.selectedTaskId !== null) return { kind: 'task', id: state.selectedTaskId };
  if (state.selectedEpicSlug !== null) return { kind: 'epic', slug: state.selectedEpicSlug };
  if (state.selectedReleaseFilename !== null) {
    return { kind: 'release', filename: state.selectedReleaseFilename };
  }
  if (state.docPopupPath !== null) return { kind: 'doc', path: state.docPopupPath };
  return null;
};

const pushCurrent = (state: BoardState): DialogRef[] => {
  const current = currentDialog(state);
  return current === null ? state.dialogStack : [...state.dialogStack, current];
};

const NO_DIALOG = {
  selectedTaskId: null,
  selectedEpicSlug: null,
  selectedReleaseFilename: null,
  docPopupPath: null,
};

const selectionFor = (ref: DialogRef) => {
  switch (ref.kind) {
    case 'task':
      return { ...NO_DIALOG, selectedTaskId: ref.id };
    case 'epic':
      return { ...NO_DIALOG, selectedEpicSlug: ref.slug };
    case 'release':
      return { ...NO_DIALOG, selectedReleaseFilename: ref.filename };
    case 'doc':
      return { ...NO_DIALOG, docPopupPath: ref.path };
  }
};

const dialogExists = (snapshot: BoardSnapshot, ref: DialogRef): boolean => {
  switch (ref.kind) {
    case 'task':
      return findTaskById(snapshot, ref.id) !== null;
    case 'epic':
      return snapshot.epics.some((e) => e.slug === ref.slug);
    case 'release':
      return snapshot.releases.some((r) => r.filename === ref.filename);
    case 'doc':
      return findDocPage(snapshot.docs, ref.path) !== null;
  }
};

export const useBoardStore = create<BoardState>(
  logErrors((set, get) => ({
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
    docPopupPath: null,
    dialogStack: [],
    createTaskForReleaseFilename: null,
    createTaskForEpicSlug: null,
    createTaskOpen: false,
    createTaskBacklog: false,
    createReleaseOpen: false,
    createEpicOpen: false,
    completeReleaseOpen: false,
    startReleaseForFilename: null,
    settingsOpen: false,
    selectedDocPath: null,
    createDocPageOpen: false,
    createDocFolderOpen: false,
    deleteDocPath: null,

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
        const guarded = createGuardedFs(fs, result.fileVersions, () => set({ conflictOpen: true }));
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
      } catch (err) {
        // The only failure in this store that never reaches errorMessage: it
        // degrades into a visible load(), so without this line the original cause
        // is lost entirely.
        log.warn('silent reload failed, falling back to a visible load', err);
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
      set((state) => ({
        ...NO_DIALOG,
        selectedTaskId: id,
        dialogStack: pushCurrent(state),
      })),

    closeTask: () => set({ selectedTaskId: null, dialogStack: [] }),

    openEpic: (slug) =>
      set((state) => ({
        ...NO_DIALOG,
        selectedEpicSlug: slug,
        dialogStack: pushCurrent(state),
      })),

    closeEpic: () => set({ selectedEpicSlug: null, dialogStack: [] }),

    openRelease: (filename) =>
      set((state) => ({
        ...NO_DIALOG,
        selectedReleaseFilename: filename,
        dialogStack: pushCurrent(state),
      })),

    closeRelease: () => set({ selectedReleaseFilename: null, dialogStack: [] }),

    // Back only, one step per press. Entries whose entity is gone (deleted
    // externally between load and return) are dropped as we walk, so the user is
    // never handed a dialog that cannot render.
    goBack: () =>
      set((state) => {
        const { snapshot } = state;
        for (let i = state.dialogStack.length - 1; i >= 0; i -= 1) {
          const ref = state.dialogStack[i]!;
          if (snapshot !== null && dialogExists(snapshot, ref)) {
            return { ...selectionFor(ref), dialogStack: state.dialogStack.slice(0, i) };
          }
        }
        return { ...NO_DIALOG, dialogStack: [] };
      }),

    openCreateTask: (releaseFilename) => set({ createTaskForReleaseFilename: releaseFilename }),

    openCreateTaskForEpic: (slug) => set({ createTaskForEpicSlug: slug }),

    openCreateTaskMenu: () => set({ createTaskOpen: true }),

    openCreateTaskBacklog: () => set({ createTaskBacklog: true }),

    closeCreateTask: () =>
      set({
        createTaskForReleaseFilename: null,
        createTaskForEpicSlug: null,
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

    selectDoc: (path) => set({ selectedDocPath: path }),

    // Following a doc link from anywhere: land on the page, and get out of the
    // dialog (or popup) the link was clicked in — forgetting that part is a bug
    // per caller, so it lives here rather than at each call site.
    openDocPage: (path) =>
      set({
        activeTab: 'docs',
        selectedDocPath: path,
        ...NO_DIALOG,
        dialogStack: [],
      }),

    // A doc link clicked inside a dialog opens the page in a read-only popup
    // instead of navigating to the Docs tab. The popup is a peer in the
    // single-dialog invariant, so it takes over from whichever dialog was open —
    // and that dialog goes on the history stack.
    openDocPopup: (path) =>
      set((state) => ({
        ...NO_DIALOG,
        docPopupPath: path,
        dialogStack: pushCurrent(state),
      })),

    closeDocPopup: () => set({ docPopupPath: null, dialogStack: [] }),

    openCreateDocPage: () => set({ createDocPageOpen: true }),
    closeCreateDocPage: () => set({ createDocPageOpen: false }),
    openCreateDocFolder: () => set({ createDocFolderOpen: true }),
    closeCreateDocFolder: () => set({ createDocFolderOpen: false }),
    openDeleteDoc: (path) => set({ deleteDocPath: path }),
    closeDeleteDoc: () => set({ deleteDocPath: null }),

    createDocPage: async (title) => {
      const { snapshot, fs, selectedDocPath } = get();
      if (!snapshot || !fs) return;

      const folder = targetDocFolder(snapshot.docs, selectedDocPath);
      const filename = docFilenameForTitle(title, folder);
      const path = docPagePath(folder, filename);
      const page: DocPage = {
        path,
        slug: filename.replace(/\.md$/, ''),
        frontmatter: { title },
        body: '',
      };

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        docs: addDocPage(snapshot.docs, folder.path, page),
      };
      set({ snapshot: nextSnapshot, selectedDocPath: path, errorMessage: null });

      try {
        await fs.write(path, serializeDocPage(page));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, selectedDocPath, errorMessage: `Failed to create page: ${message}` });
        throw err;
      }
    },

    createDocFolder: async (name) => {
      const { snapshot, fs, selectedDocPath } = get();
      if (!snapshot || !fs) return;

      const parent = targetDocFolder(snapshot.docs, selectedDocPath);
      const path = `${parent.path}/${name}`;

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        docs: addDocFolder(snapshot.docs, parent.path, name),
      };
      set({ snapshot: nextSnapshot, selectedDocPath: path, errorMessage: null });

      try {
        await fs.mkdir(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, selectedDocPath, errorMessage: `Failed to create folder: ${message}` });
        throw err;
      }
    },

    saveDocPage: async (path, title, body) => {
      const { snapshot, fs } = get();
      if (!snapshot || !fs) return;

      const next: DocPage = {
        path,
        slug: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
        frontmatter: { title },
        body,
      };

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        docs: replaceDocPage(snapshot.docs, next),
      };
      set({ snapshot: nextSnapshot, errorMessage: null });

      try {
        await fs.write(path, serializeDocPage(next));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, errorMessage: `Failed to save page: ${message}` });
        throw err;
      }
    },

    deleteDocPage: async (path) => {
      const { snapshot, fs, selectedDocPath } = get();
      if (!snapshot || !fs) return;

      const nextSelected = selectedDocPath === path ? null : selectedDocPath;
      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        docs: removeDocPage(snapshot.docs, path),
      };
      set({ snapshot: nextSnapshot, selectedDocPath: nextSelected, errorMessage: null });

      try {
        await fs.remove(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, selectedDocPath, errorMessage: `Failed to delete page: ${message}` });
        throw err;
      }
    },

    deleteDocFolder: async (path) => {
      const { snapshot, fs, selectedDocPath } = get();
      if (!snapshot || !fs) return;

      const folder = findDocFolder(snapshot.docs, path);
      if (folder === null) return;

      // Only an empty folder is deletable, so a deletion can never take content the
      // user did not see. The UI disables the affordance; this is the invariant.
      if (!isDocFolderEmpty(folder)) {
        set({ errorMessage: 'Only an empty folder can be deleted.' });
        return;
      }

      const nextSelected = selectedDocPath === path ? null : selectedDocPath;

      const nextSnapshot: BoardSnapshot = {
        ...snapshot,
        docs: removeDocFolder(snapshot.docs, path),
      };
      set({ snapshot: nextSnapshot, selectedDocPath: nextSelected, errorMessage: null });

      try {
        await fs.removeDir(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ snapshot, selectedDocPath, errorMessage: `Failed to delete folder: ${message}` });
        throw err;
      }
    },

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

      const releaseIndex = snapshot.releases.findIndex((r) => r.frontmatter.status === 'current');
      if (releaseIndex === -1) {
        set({ errorMessage: 'No current release to complete' });
        return;
      }

      let targetReleaseIndex = -1;
      if (target.kind === 'release') {
        targetReleaseIndex = snapshot.releases.findIndex((r) => r.filename === target.filename);
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
          target.kind === 'backlog' ? (snapshot.backlog ?? emptyBacklog()) : snapshot.backlog,
        targetRelease: targetReleaseIndex === -1 ? null : snapshot.releases[targetReleaseIndex]!,
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

      const releaseIndex = snapshot.releases.findIndex((r) => r.filename === filename);
      if (releaseIndex === -1) {
        set({ errorMessage: `Release not found: ${filename}` });
        return;
      }

      const started = startReleaseInBoard(snapshot.releases[releaseIndex]!, snapshot.releases);

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

        const moved = moveTaskBetweenContainers(sourceLoc.container, destLoc.container, taskId, {
          newStatus: task.frontmatter.status,
          beforeTaskId: null,
          destEpic: destEpicForLocation(destLoc),
        });

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
        const index = snapshot.releases.findIndex((r) => r.filename === targetReleaseFilename);
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

      const moved = moveTaskBetweenContainers(sourceLoc.container, destLoc.container, taskId, {
        newStatus: task.frontmatter.status,
        beforeTaskId: null,
        destEpic: destEpicForLocation(destLoc),
      });

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
        const index = snapshot.releases.findIndex((r) => r.filename === target.filename);
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
          const moved = moveTaskBetweenContainers(sourceLoc.container, destLoc.container, taskId, {
            newStatus: task.frontmatter.status,
            beforeTaskId,
            destEpic: destEpicForLocation(destLoc),
          });
          nextSource = moved.source;
          nextDest = moved.dest;
        }

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
          const moved = moveTaskBetweenContainers(sourceLoc.container, destEpic, taskId, {
            newStatus: task.frontmatter.status,
            beforeTaskId: null,
            destEpic: { kind: 'set', slug: destEpic.slug },
          });
          movedSource = moved.source;
          nextEpics = [...snapshot.epics];
          nextEpics[epicIdx] = moved.dest;
        } else {
          if (!snapshot.backlog) {
            set({ errorMessage: 'Backlog container (no_epic.md) is missing' });
            return;
          }
          const moved = moveTaskBetweenContainers(sourceLoc.container, snapshot.backlog, taskId, {
            newStatus: task.frontmatter.status,
            beforeTaskId: null,
            destEpic: { kind: 'clear' },
          });
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
      const nextEpics = result.containers.slice(releaseCount, releaseCount + epicCount) as Epic[];
      const nextBacklog = backlog ? (result.containers[releaseCount + epicCount] as Backlog) : null;

      const kindOf = (index: number): ContainerLocation['kind'] =>
        index < releaseCount ? 'release' : index < releaseCount + epicCount ? 'epic' : 'backlog';

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
      // A deleted task is the end of the chain, not a step in it: close out of the
      // whole history rather than stepping back into a dialog the user was done with.
      set({ snapshot: nextSnapshot, errorMessage: null, selectedTaskId: null, dialogStack: [] });
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
  })),
);
