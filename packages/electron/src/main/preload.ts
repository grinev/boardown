import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FileStat, Theme } from '@boardown/core';
import {
  IPC,
  type BoardownBridge,
  type BootstrapState,
  type FsRequest,
  type ProjectEntry,
} from '../bridge';

const bootstrap = ipcRenderer.sendSync(IPC.bootstrap) as BootstrapState;

const fsCall = (req: FsRequest): Promise<unknown> => ipcRenderer.invoke(IPC.fs, req);

const bridge: BoardownBridge = {
  theme: bootstrap.theme,
  initialFolder: bootstrap.initialFolder,
  fs: {
    read: async (filePath) => {
      // Host returns null for a missing file (no IPC error log); restore the
      // rejection FsAdapter.read promises so the loader's try/catch still works.
      const result = await fsCall({ method: 'read', path: filePath });
      if (result === null) throw new Error(`ENOENT: ${filePath}`);
      return result as string;
    },
    write: async (filePath, content) => {
      await fsCall({ method: 'write', path: filePath, content });
    },
    list: (dir) => fsCall({ method: 'list', path: dir }) as Promise<string[]>,
    stat: (filePath) => fsCall({ method: 'stat', path: filePath }) as Promise<FileStat | null>,
  },
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<void>,
  openRecent: (folder) => ipcRenderer.invoke(IPC.openRecent, folder) as Promise<void>,
  cancelBoard: () => ipcRenderer.invoke(IPC.cancelBoard) as Promise<void>,
  removeRecent: (folder) => ipcRenderer.invoke(IPC.removeRecent, folder) as Promise<void>,
  getRecents: () => ipcRenderer.invoke(IPC.getRecents) as Promise<ProjectEntry[]>,
  onBoardOpened: (listener) => {
    const handler = (_event: IpcRendererEvent, folder: string): void => listener(folder);
    ipcRenderer.on(IPC.boardOpened, handler);
    return () => ipcRenderer.removeListener(IPC.boardOpened, handler);
  },
  onBoardClosed: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.boardClosed, handler);
    return () => ipcRenderer.removeListener(IPC.boardClosed, handler);
  },
  onThemeChange: (listener) => {
    const handler = (_event: IpcRendererEvent, theme: Theme): void => listener(theme);
    ipcRenderer.on(IPC.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC.themeChanged, handler);
  },
};

contextBridge.exposeInMainWorld('boardown', bridge);
