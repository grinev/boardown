import { statSync } from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import type { Theme } from '@boardown/core';
import { IPC, type BootstrapState, type FsRequest, type ThemeChoice } from '../bridge';
import { handleFsRequest } from './board-fs';
import { buildAppMenu } from './menu';
import { addRecent, isKnownRecent, listRecents, removeRecent } from './recent-folders';
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
// ('boardown'), so the two would keep their recent-folders list in different
// directories. Setting it here makes both use the same `boardown` userData dir.
app.setName('boardown');

// Set by the dev script; when present the renderer is served from Vite with HMR
// instead of the packaged files, and we skip the production CSP (Vite needs its
// own for HMR).
const DEV_SERVER_URL = process.env.BOARDOWN_RENDERER_URL;
const BOARD_DIR = '.boardown';

// Per-window board context, keyed by webContents id: the project folder the user
// opened and the .boardown root every fs request for that window resolves to.
interface BoardContext {
  folder: string;
  boardRoot: string;
}
const boards = new Map<number, BoardContext>();

// Persisted app settings (theme choice + window bounds), loaded on startup.
let settings: Settings = { themeChoice: 'system' };

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

function setBoard(window: BrowserWindow, folder: string): void {
  boards.set(window.webContents.id, { folder, boardRoot: path.join(folder, BOARD_DIR) });
}

async function openBoard(window: BrowserWindow, folder: string): Promise<void> {
  setBoard(window, folder);
  // Remember it as the last-open project so it reopens on next launch.
  settings = { ...settings, lastFolder: folder };
  await addRecent(folder);
  void saveSettings(settings);
  window.webContents.send(IPC.boardOpened, folder);
}

// Drop the window's board and send it back to the welcome screen. The board
// stays in recents, so reopening it is one click away — but closing is
// deliberate, so don't auto-reopen it on next launch.
function closeBoard(window: BrowserWindow): void {
  boards.delete(window.webContents.id);
  const { lastFolder, ...rest } = settings;
  settings = rest;
  void saveSettings(settings);
  window.webContents.send(IPC.boardClosed);
}

async function showOpenDialog(window: BrowserWindow): Promise<void> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Open Board Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  const folder = result.filePaths[0];
  if (result.canceled || folder === undefined) return;
  await openBoard(window, folder);
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
function lastOpenedFolder(): string | null {
  return settings.lastFolder && isDirectory(settings.lastFolder) ? settings.lastFolder : null;
}

function createWindow(initialFolder: string | null): void {
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
  if (initialFolder !== null) {
    setBoard(window, initialFolder);
    settings = { ...settings, lastFolder: initialFolder };
    void addRecent(initialFolder);
    void saveSettings(settings);
  }

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
    boards.delete(id);
  });

  if (settings.windowMaximized) window.maximize();

  if (DEV_SERVER_URL !== undefined) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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
          "default-src 'none'; img-src 'self' data:; font-src 'self'; " +
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
      initialFolder: ctx?.folder ?? null,
    };
    event.returnValue = state;
  });

  ipcMain.handle(IPC.fs, async (event: IpcMainInvokeEvent, req: FsRequest) => {
    const ctx = boards.get(event.sender.id);
    if (!ctx) throw new Error('No board is open for this window');
    return handleFsRequest(ctx.boardRoot, req);
  });

  ipcMain.handle(IPC.pickFolder, async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) await showOpenDialog(window);
  });

  ipcMain.handle(IPC.openRecent, async (event: IpcMainInvokeEvent, folder: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    // Only honor folders we actually offered; never let the renderer point the
    // board root at an arbitrary path without going through the native dialog.
    if (await isKnownRecent(folder)) await openBoard(window, folder);
  });

  ipcMain.handle(IPC.cancelBoard, async (event: IpcMainInvokeEvent) => {
    const ctx = boards.get(event.sender.id);
    if (!ctx) return;
    boards.delete(event.sender.id);
    if (settings.lastFolder === ctx.folder) {
      const { lastFolder, ...rest } = settings;
      settings = rest;
    }
    await removeRecent(ctx.folder);
    void saveSettings(settings);
  });

  ipcMain.handle(IPC.removeRecent, async (_event: IpcMainInvokeEvent, folder: string) => {
    await removeRecent(folder);
  });

  ipcMain.handle(IPC.getRecents, () => listRecents());

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
}

app
  .whenReady()
  .then(async () => {
    settings = await loadSettings();
    registerIpc();
    applySecurityHeaders();
    Menu.setApplicationMenu(
      buildAppMenu({
        openFolder: (window) => void showOpenDialog(window),
        closeBoard: (window) => closeBoard(window),
      }),
    );
    createWindow(parseFolderArg(process.argv) ?? lastOpenedFolder());

    // In 'system' mode the effective theme tracks the OS; in fixed modes
    // broadcastTheme re-sends the same value, which is a harmless no-op.
    nativeTheme.on('updated', () => broadcastTheme());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(lastOpenedFolder());
    });
  })
  .catch((err: unknown) => {
    console.error(err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
