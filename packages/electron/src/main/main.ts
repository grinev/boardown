import { statSync } from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import type { Theme } from '@boardown/core';
import { IPC, type BootstrapState, type FsRequest } from '../bridge';
import { handleFsRequest } from './board-fs';
import { buildAppMenu } from './menu';
import { addRecent, isKnownRecent, listRecents, removeRecent } from './recent-folders';

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

function currentTheme(): Theme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function setBoard(window: BrowserWindow, folder: string): void {
  boards.set(window.webContents.id, { folder, boardRoot: path.join(folder, BOARD_DIR) });
}

async function openBoard(window: BrowserWindow, folder: string): Promise<void> {
  setBoard(window, folder);
  await addRecent(folder);
  window.webContents.send(IPC.boardOpened, folder);
}

// Drop the window's board and send it back to the welcome screen. The board
// stays in recents, so reopening it is one click away.
function closeBoard(window: BrowserWindow): void {
  boards.delete(window.webContents.id);
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

function createWindow(initialFolder: string | null): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: currentTheme() === 'dark' ? '#121314' : '#ffffff',
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
    void addRecent(initialFolder);
  }
  window.webContents.on('destroyed', () => {
    boards.delete(id);
  });

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
      theme: currentTheme(),
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
    await removeRecent(ctx.folder);
  });

  ipcMain.handle(IPC.removeRecent, async (_event: IpcMainInvokeEvent, folder: string) => {
    await removeRecent(folder);
  });

  ipcMain.handle(IPC.getRecents, () => listRecents());
}

app
  .whenReady()
  .then(() => {
    registerIpc();
    applySecurityHeaders();
    Menu.setApplicationMenu(
      buildAppMenu({
        openFolder: (window) => void showOpenDialog(window),
        closeBoard: (window) => closeBoard(window),
      }),
    );
    createWindow(parseFolderArg(process.argv));

    nativeTheme.on('updated', () => {
      const theme = currentTheme();
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC.themeChanged, theme);
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
    });
  })
  .catch((err: unknown) => {
    console.error(err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
