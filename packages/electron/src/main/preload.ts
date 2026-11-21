import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FileStat, FsEntry, GitHistoryResult, ProjectFileRead, Theme } from '@boardown/core';
import {
  IPC,
  type BoardownBridge,
  type BoardCapabilities,
  type BootstrapState,
  type FsRequest,
  type OpenProject,
  type ProjectListSnapshot,
} from '../bridge';

const bootstrap = ipcRenderer.sendSync(IPC.bootstrap) as BootstrapState;

const connectBoard = (scope: string): BoardCapabilities => {
  const fsCall = (req: FsRequest): Promise<unknown> => ipcRenderer.invoke(IPC.fs, scope, req);
  return {
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
      readBytes: async (filePath) => {
        const result = await fsCall({ method: 'readBytes', path: filePath });
        if (result === null) throw new Error(`ENOENT: ${filePath}`);
        return result as Uint8Array;
      },
      writeBytes: async (filePath, content) => {
        await fsCall({ method: 'writeBytes', path: filePath, content });
      },
      list: (dir) => fsCall({ method: 'list', path: dir }) as Promise<FsEntry[]>,
      stat: (filePath) => fsCall({ method: 'stat', path: filePath }) as Promise<FileStat | null>,
      mkdir: async (dir) => {
        await fsCall({ method: 'mkdir', path: dir });
      },
      remove: async (filePath) => {
        await fsCall({ method: 'remove', path: filePath });
      },
    },
    projectFiles: {
      readFile: (filePath) =>
        ipcRenderer.invoke(IPC.projectFile, scope, filePath) as Promise<ProjectFileRead>,
    },
    gitHistory: {
      commitsForTask: (taskId) =>
        ipcRenderer.invoke(IPC.gitCommits, scope, taskId) as Promise<GitHistoryResult>,
    },
  };
};

const bridge: BoardownBridge = {
  theme: bootstrap.theme,
  themeChoice: bootstrap.themeChoice,
  initialProject: bootstrap.initialProject,
  showMenuButton: bootstrap.showMenuButton,
  autoRefresh: bootstrap.autoRefresh,
  connectBoard,
  fileSaver: {
    save: (name, content) => ipcRenderer.invoke(IPC.saveFile, { name, content }) as Promise<void>,
  },
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<void>,
  popupMenu: () => ipcRenderer.send(IPC.popupMenu),
  openProject: (id) => ipcRenderer.invoke(IPC.openProject, id) as Promise<void>,
  closeBoard: () => ipcRenderer.invoke(IPC.closeBoard) as Promise<void>,
  removeProject: (id) => ipcRenderer.invoke(IPC.removeProject, id) as Promise<void>,
  getProjects: () => ipcRenderer.invoke(IPC.getProjects) as Promise<ProjectListSnapshot>,
  setThemeChoice: (choice) => ipcRenderer.invoke(IPC.setThemeChoice, choice) as Promise<void>,
  setAutoRefresh: (enabled) => ipcRenderer.invoke(IPC.setAutoRefresh, enabled) as Promise<void>,
  onBoardOpened: (listener) => {
    const handler = (_event: IpcRendererEvent, project: OpenProject): void => listener(project);
    ipcRenderer.on(IPC.boardOpened, handler);
    return () => ipcRenderer.removeListener(IPC.boardOpened, handler);
  },
  onProjectsChanged: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.projectsChanged, handler);
    return () => ipcRenderer.removeListener(IPC.projectsChanged, handler);
  },
  onBoardClosed: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.boardClosed, handler);
    return () => ipcRenderer.removeListener(IPC.boardClosed, handler);
  },
  onBoardChanged: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.boardChanged, handler);
    return () => ipcRenderer.removeListener(IPC.boardChanged, handler);
  },
  onThemeChange: (listener) => {
    const handler = (_event: IpcRendererEvent, theme: Theme): void => listener(theme);
    ipcRenderer.on(IPC.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC.themeChanged, handler);
  },
};

contextBridge.exposeInMainWorld('boardown', bridge);
