import { randomUUID } from 'node:crypto';
import { promises as fsp, statSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import type { GitHistoryResult, ProjectFileRead, Theme } from '@boardown/core';
import {
  DOCS_DIR,
  configureLogging,
  createLogger,
  formatLogRecord,
  readTaskCommits,
} from '@boardown/core';
import {
  describeEntries,
  openDefaultRegistry,
  type RegistryEntry,
  type RegistryFile,
} from '@boardown/projects';
import {
  IPC,
  type BootstrapState,
  type FsRequest,
  type OpenProject,
  type SaveFileRequest,
  type ThemeChoice,
} from '../bridge';
import { handleFsRequest } from './board-fs';
import { readProjectFile } from './project-file';
import { gitRunIn } from './git-history';
import { classifyNavigation } from './external-links';
import { buildAppMenu } from './menu';
import {
  isThemeChoice,
  loadSettings,
  saveSettings,
  type Settings,
  type WindowBounds,
} from './settings';

// Pin the app name before anything reads app.getPath('userData') (Electron
// caches it on first access). Otherwise dev (`electron .`) would derive it from
// package.json (`@boardown/electron`) while the packaged app uses productName
// ('boardown'), so the two would keep their preferences in different
// directories. Setting it here makes both use the same `boardown` userData dir.
app.setName('boardown');

// The only sink any shipped shell installs, and only so a bootstrap failure
// still leaves a trace on stderr. Nothing else in Electron logs, so a normal run
// prints nothing; file logging belongs to the web dev shell alone.
configureLogging({
  sink: (record) => process.stderr.write(`${formatLogRecord(record)}\n`),
});
const log = createLogger('electron.main');

// Set by the dev script; when present the renderer is served from Vite with HMR
// instead of the packaged files, and we skip the production CSP (Vite needs its
// own for HMR).
const DEV_SERVER_URL = process.env.BOARDOWN_RENDERER_URL;

// Per-window board context, keyed by webContents id: the project folder the user
// opened and the .boardown root every fs request for that window resolves to.
type BoardContext = RegistryEntry & OpenProject;
const boards = new Map<number, BoardContext>();
let registry: RegistryFile;

// How long after the host writes a file its own watch event is ignored, so the
// renderer's own saves don't bounce back as an "external change" refresh.
const ECHO_WINDOW_MS = 2000;
// Collapse a burst of changes (e.g. a `git checkout`) into a single refresh.
const REFRESH_DEBOUNCE_MS = 200;

// Per-window file watcher over the open board's .boardown/, keyed by webContents
// id (parallel to `boards`). Present only while auto-refresh is on and a board is
// open; recentWrites tracks the host's own writes for echo suppression.
interface BoardWatcher {
  watchers: FSWatcher[];
  recentWrites: Map<string, number>;
  debounceTimer?: ReturnType<typeof setTimeout> | undefined;
}
const boardWatchers = new Map<number, BoardWatcher>();

// Persisted app settings (theme choice + window bounds), loaded on startup.
let settings: Settings = { themeChoice: 'system' };

// The native application menu, built once at startup. Used as the macOS system
// menu bar and as the Win/Linux popup triggered by the ☰ button.
let appMenu: Menu;

function effectiveTheme(): Theme {
  if (settings.themeChoice === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return settings.themeChoice;
}

// Whether saved bounds overlap a currently-connected display, so we don't
// restore a window onto a monitor that has been unplugged.
function boundsVisible(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    );
  });
}

function rememberWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  const maximized = window.isMaximized();
  // Capture geometry only in the normal state — a maximized or full-screen frame
  // (including the macOS zoom) isn't a size to restore to, so the kept bounds
  // stay the real window size and carry the screen position. windowMaximized
  // restores the maximized state; full screen is intentionally not restored.
  settings = {
    ...settings,
    ...(maximized || window.isFullScreen() ? {} : { windowBounds: window.getBounds() }),
    windowMaximized: maximized,
  };
  void saveSettings(settings);
}

function broadcastTheme(): void {
  const theme = effectiveTheme();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.themeChanged, theme);
  }
}

function autoRefreshEnabled(): boolean {
  // Absent means on; only an explicit false disables it.
  return settings.autoRefresh !== false;
}

function disposeWatcher(id: number): void {
  const bw = boardWatchers.get(id);
  if (!bw) return;
  clearTimeout(bw.debounceTimer);
  for (const w of bw.watchers) w.close();
  bw.recentWrites.clear();
  boardWatchers.delete(id);
}

// (Re)build the per-window watcher for the board open in `window`: replaces any
// existing one (board switch) and tears it down when auto-refresh is off.
// Rather than rely on recursive fs.watch — unreliable on Linux — we watch the
// root and each subdirectory explicitly: one level for the flat releases/ and
// epics/, the whole tree for docs/, which nests arbitrarily.
function applyWatcher(window: BrowserWindow): void {
  const id = window.webContents.id;
  disposeWatcher(id);
  if (!autoRefreshEnabled()) return;
  const ctx = boards.get(id);
  if (!ctx) return;

  const bw: BoardWatcher = { watchers: [], recentWrites: new Map() };
  boardWatchers.set(id, bw);

  const onEvent =
    (dir: string) =>
    (_event: string, filename: string | null): void => {
      if (filename !== null) {
        const abs = path.join(dir, filename);
        const at = bw.recentWrites.get(abs);
        if (at !== undefined) {
          // The host's own write echoes back as a watch event — ignore it while
          // fresh; let a stale entry fall through (and drop it).
          if (Date.now() - at <= ECHO_WINDOW_MS) return;
          bw.recentWrites.delete(abs);
        }
      }
      clearTimeout(bw.debounceTimer);
      bw.debounceTimer = setTimeout(() => {
        bw.debounceTimer = undefined;
        if (!window.isDestroyed()) window.webContents.send(IPC.boardChanged);
      }, REFRESH_DEBOUNCE_MS);
    };

  const watchDir = (dir: string): void => {
    try {
      bw.watchers.push(watch(dir, onEvent(dir)));
    } catch {
      // A directory that isn't there (or vanished between readdir and watch) —
      // skip it; the root watcher still catches it being created.
    }
  };

  // releases/ and epics/ are flat, but docs/ nests to any depth, so it is walked
  // rather than watched one level down.
  const watchTree = (dir: string): void => {
    watchDir(dir);
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) watchTree(path.join(dir, entry.name));
      }
    } catch {
      // Vanished between readdir and watch — the parent watcher still covers it.
    }
  };

  watchDir(ctx.boardRoot);
  try {
    for (const entry of readdirSync(ctx.boardRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(ctx.boardRoot, entry.name);
      if (entry.name === DOCS_DIR) watchTree(dir);
      else watchDir(dir);
    }
  } catch {
    // Board root missing — nothing to watch until files appear.
  }
}

// Persist first, mutate in-memory only on success (mirrors setThemeChoice), so a
// failed save leaves main consistent and the renderer reverts its checkbox.
// Applies to every open window immediately; the toggle lives in the renderer's
// Settings panel.
async function setAutoRefresh(enabled: boolean): Promise<void> {
  const next: Settings = { ...settings, autoRefresh: enabled };
  await saveSettings(next);
  settings = next;
  for (const window of BrowserWindow.getAllWindows()) applyWatcher(window);
}

function buildMenu(): void {
  appMenu = buildAppMenu({
    openFolder: (window) =>
      void showOpenDialog(window).catch((error: unknown) => {
        dialog.showErrorBox(
          'Cannot open project',
          error instanceof Error ? error.message : String(error),
        );
      }),
    closeBoard: (window) => closeBoard(window),
  });
  // macOS keeps the app menu as its system menu bar; Windows/Linux drop the bar
  // and reach the same menu through the renderer's ☰ popup.
  Menu.setApplicationMenu(process.platform === 'darwin' ? appMenu : null);
}

function setBoard(window: BrowserWindow, entry: RegistryEntry): OpenProject {
  const scope = randomUUID();
  boards.set(window.webContents.id, { ...entry, scope });
  return { id: entry.id, projectRoot: entry.projectRoot, scope };
}

function openBoard(window: BrowserWindow, entry: RegistryEntry): void {
  if (window.isDestroyed()) return;
  const current = boards.get(window.webContents.id);
  if (current?.id === entry.id && current.projectRoot === entry.projectRoot) return;
  const openProject = setBoard(window, entry);
  settings = { ...settings, lastFolder: entry.projectRoot };
  void saveSettings(settings).catch((error: unknown) =>
    log.error('Could not save selected project', error),
  );
  // Switch the watcher to the new board (replaces any prior one for this window).
  applyWatcher(window);
  window.webContents.send(IPC.boardOpened, openProject);
}

// Drop the window's board and send it back to the welcome screen. The board
// stays in the registry, so reopening it is one click away — but closing is
// deliberate, so don't auto-reopen it on next launch.
function closeBoard(window: BrowserWindow): void {
  const id = window.webContents.id;
  const current = boards.get(id);
  if (current === undefined) return;
  disposeWatcher(id);
  boards.delete(id);
  if (settings.lastFolder === current.projectRoot) {
    const { lastFolder, ...rest } = settings;
    settings = rest;
    void saveSettings(settings).catch((error: unknown) =>
      log.error('Could not clear selected project', error),
    );
  }
  window.webContents.send(IPC.boardClosed);
}

async function selectProject(window: BrowserWindow, id: string): Promise<void> {
  const entry = (await registry.read()).entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error('Project is no longer registered');
  if (!isDirectory(entry.projectRoot)) throw new Error('Project folder is unavailable');
  openBoard(window, entry);
}

async function projectsChanged(): Promise<void> {
  const state = await registry.read();
  for (const window of BrowserWindow.getAllWindows()) {
    const open = boards.get(window.webContents.id);
    if (
      open !== undefined &&
      !state.entries.some(
        ({ id, projectRoot }) => id === open.id && projectRoot === open.projectRoot,
      )
    ) {
      closeBoard(window);
    }
    window.webContents.send(IPC.projectsChanged);
  }
}

async function showOpenDialog(window: BrowserWindow): Promise<void> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Open Board Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  const folder = result.filePaths[0];
  if (result.canceled || folder === undefined) return;
  await selectProject(window, await registry.register(folder));
  await projectsChanged();
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// CLI args minus Electron's own: in dev (`electron <appDir> …`) argv[1] is the
// app directory, while in a packaged app argv[1] is already the first real arg.
function cliArgs(argv: string[]): string[] {
  return process.defaultApp ? argv.slice(2) : argv.slice(1);
}

// First CLI argument that resolves to an existing directory, so both the
// packaged form (`boardown <folder>`) and `pnpm dev -- <folder>` open it on boot.
function parseFolderArg(argv: string[]): string | null {
  for (const arg of cliArgs(argv)) {
    if (arg.startsWith('-')) continue;
    const resolved = path.resolve(arg);
    if (isDirectory(resolved)) return resolved;
  }
  return null;
}

// The project to reopen on launch when no folder is passed on the CLI: the last
// one that was open, if it still exists on disk.
async function lastOpenedProject(): Promise<RegistryEntry | null> {
  const folder = settings.lastFolder;
  return folder && isDirectory(folder) ? registry.findFolder(folder) : null;
}

function createWindow(initialEntry: RegistryEntry | null): void {
  const saved = settings.windowBounds;
  const window = new BrowserWindow({
    width: saved?.width ?? 1100,
    height: saved?.height ?? 760,
    ...(saved && boundsVisible(saved) ? { x: saved.x, y: saved.y } : {}),
    minWidth: 600,
    minHeight: 400,
    backgroundColor: effectiveTheme() === 'dark' ? '#121314' : '#ffffff',
    title: 'boardown',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const id = window.webContents.id;
  if (initialEntry !== null) {
    setBoard(window, initialEntry);
    settings = { ...settings, lastFolder: initialEntry.projectRoot };
    void saveSettings(settings).catch((error: unknown) =>
      log.error('Could not save selected project', error),
    );
    applyWatcher(window);
  }
  window.on('focus', () => window.webContents.send(IPC.projectsChanged));

  // Remember size/position across launches. Debounce resize/move (they fire in
  // bursts) and also save on close; writes are atomic, so a force-quit can't
  // corrupt the settings file.
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleBoundsSave = (): void => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => rememberWindow(window), 400);
  };
  window.on('resize', scheduleBoundsSave);
  window.on('move', scheduleBoundsSave);
  window.on('close', () => {
    clearTimeout(boundsTimer);
    rememberWindow(window);
  });

  window.webContents.on('destroyed', () => {
    disposeWatcher(id);
    boards.delete(id);
  });

  if (settings.windowMaximized) window.maximize();

  const rendererIndex = path.join(__dirname, 'renderer', 'index.html');
  const appDocument = DEV_SERVER_URL ?? pathToFileURL(rendererIndex).href;

  // Without these the app has no navigation policy at all: a link in a doc page
  // replaces the board with a remote site, and there is no address bar to get
  // back from. Both paths a click can take are routed through one allowlist.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (classifyNavigation(url, appDocument) === 'external') void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const verdict = classifyNavigation(url, appDocument);
    if (verdict === 'in-app') return;
    event.preventDefault();
    if (verdict === 'external') void shell.openExternal(url);
  });

  if (DEV_SERVER_URL !== undefined) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(rendererIndex);
  }
}

// Lock the renderer down to its own bundled assets in production. Skipped under
// the Vite dev server, which serves inline scripts and a websocket for HMR.
function applySecurityHeaders(): void {
  if (DEV_SERVER_URL !== undefined) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'none'; img-src 'self' data: blob:; font-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; script-src 'self'",
        ],
      },
    });
  });
}

function registerIpc(): void {
  ipcMain.on(IPC.bootstrap, (event) => {
    const ctx = boards.get(event.sender.id);
    const state: BootstrapState = {
      theme: effectiveTheme(),
      themeChoice: settings.themeChoice,
      initialProject:
        ctx === undefined ? null : { id: ctx.id, projectRoot: ctx.projectRoot, scope: ctx.scope },
      showMenuButton: process.platform !== 'darwin',
      autoRefresh: autoRefreshEnabled(),
    };
    event.returnValue = state;
  });

  ipcMain.on(IPC.popupMenu, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) appMenu.popup({ window });
  });

  ipcMain.handle(IPC.fs, async (event: IpcMainInvokeEvent, scope: string, req: FsRequest) => {
    const ctx = boards.get(event.sender.id);
    if (ctx?.scope !== scope || ctx === undefined)
      throw new Error('This project is no longer open');
    const id = event.sender.id;
    // Record the host's own writes so the watcher can tell them apart from
    // external changes. No-op when this window has no watcher (auto-refresh off).
    return handleFsRequest(ctx.boardRoot, req, (abs) => {
      if (boards.get(id) === ctx) boardWatchers.get(id)?.recentWrites.set(abs, Date.now());
    });
  });

  ipcMain.handle(
    IPC.projectFile,
    async (event: IpcMainInvokeEvent, scope: string, filePath: string) => {
      const ctx = boards.get(event.sender.id);
      // Scoped to the project folder, not the board root — and read-only.
      if (ctx?.scope !== scope || ctx === undefined)
        return { kind: 'unreadable' } satisfies ProjectFileRead;
      return readProjectFile(ctx.projectRoot, filePath);
    },
  );

  ipcMain.handle(
    IPC.gitCommits,
    async (event: IpcMainInvokeEvent, scope: string, taskId: string) => {
      const ctx = boards.get(event.sender.id);
      // No board open means no project folder to run git in; the panel says so.
      if (ctx?.scope !== scope || ctx === undefined)
        return { state: 'git-unavailable', commits: [] } satisfies GitHistoryResult;
      return readTaskCommits(taskId, gitRunIn(ctx.projectRoot));
    },
  );

  // Download: the destination is whatever the user picks in the native dialog —
  // never a path the renderer names — and a cancelled dialog writes nothing.
  ipcMain.handle(IPC.saveFile, async (event: IpcMainInvokeEvent, req: SaveFileRequest) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: req.name };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || result.filePath === undefined || result.filePath === '') return;
    await fsp.writeFile(result.filePath, req.content);
  });

  ipcMain.handle(IPC.pickFolder, async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) await showOpenDialog(window);
  });

  ipcMain.handle(IPC.openProject, async (event: IpcMainInvokeEvent, id: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && typeof id === 'string') await selectProject(window, id);
  });

  ipcMain.handle(IPC.closeBoard, (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) closeBoard(window);
  });

  ipcMain.handle(IPC.removeProject, async (_event: IpcMainInvokeEvent, id: string) => {
    if (typeof id !== 'string') return;
    await registry.remove(id);
    await projectsChanged();
  });

  ipcMain.handle(IPC.getProjects, async () => {
    const state = await registry.read();
    return { projects: await describeEntries(state.entries), error: state.staleReason };
  });

  ipcMain.handle(IPC.setThemeChoice, async (_event: IpcMainInvokeEvent, choice: ThemeChoice) => {
    // IPC is an untrusted, stringly-typed boundary — validate before persisting.
    if (!isThemeChoice(choice)) return;
    // Persist first; only update in-memory + broadcast if the write succeeded,
    // so a failed save leaves main consistent (and the renderer reverts its UI).
    const next: Settings = { ...settings, themeChoice: choice };
    await saveSettings(next);
    settings = next;
    broadcastTheme();
  });

  ipcMain.handle(IPC.setAutoRefresh, async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    // IPC is an untrusted, stringly-typed boundary — validate before persisting.
    if (typeof enabled !== 'boolean') return;
    await setAutoRefresh(enabled);
  });
}

app
  .whenReady()
  .then(async () => {
    settings = await loadSettings();
    registry = await openDefaultRegistry();
    // app.getName() is the scoped package name in a from-sources run, so the
    // product name is stated here rather than derived.
    app.setAboutPanelOptions({
      applicationName: 'boardown',
      applicationVersion: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} Ruslan Grinev — MIT`,
    });
    buildMenu();
    registerIpc();
    applySecurityHeaders();
    // macOS always shows its system menu bar, so keep the app menu there. On
    // Windows/Linux drop the menu bar entirely; the renderer's ☰ button pops
    // the same menu up via IPC.popupMenu.
    Menu.setApplicationMenu(process.platform === 'darwin' ? appMenu : null);
    const folder = parseFolderArg(process.argv);
    let initial = await lastOpenedProject();
    if (folder !== null) {
      try {
        const id = await registry.register(folder);
        initial = (await registry.read()).entries.find((entry) => entry.id === id) ?? null;
      } catch (error) {
        dialog.showErrorBox(
          'Cannot open project',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    const unsubscribe = registry.watch(
      () =>
        void projectsChanged().catch((error: unknown) =>
          log.error('Could not refresh projects', error),
        ),
    );
    app.once('before-quit', unsubscribe);
    createWindow(initial);

    // In 'system' mode the effective theme tracks the OS; in fixed modes
    // broadcastTheme re-sends the same value, which is a harmless no-op.
    nativeTheme.on('updated', () => broadcastTheme());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void lastOpenedProject()
          .then(createWindow)
          .catch((error: unknown) => log.error('Could not restore project', error));
      }
    });
  })
  .catch((err: unknown) => {
    log.error('failed to start', err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
