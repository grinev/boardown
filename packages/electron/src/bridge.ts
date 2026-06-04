import type { FsAdapter, Theme } from '@boardown/core';

export type FsMethod = 'read' | 'write' | 'list' | 'stat';

// App-wide theme setting. 'system' follows the OS; 'light'/'dark' are fixed.
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface FsRequest {
  method: FsMethod;
  path: string;
  content?: string;
}

export interface RecentEntry {
  folder: string;
  name: string;
  lastOpened: number;
}

// A recent entry enriched for the sidebar: whether the folder already has a
// board (a .boardown/config.yaml) or still needs onboarding. Not persisted —
// computed per listing.
export interface ProjectEntry extends RecentEntry {
  hasBoard: boolean;
}

// Synchronous startup state the preload reads before first paint, so the
// welcome screen and the initial board both render with the right theme and the
// CLI-supplied folder without a round-trip flash.
export interface BootstrapState {
  theme: Theme;
  themeChoice: ThemeChoice;
  initialFolder: string | null;
}

// The surface exposed on window.boardown by the preload. The renderer talks to
// this and nothing else — never to Node or Electron APIs directly. `fs` is the
// plain FsAdapter @boardown/ui consumes; the host resolves every path against
// the currently open board.
export interface BoardownBridge {
  readonly theme: Theme;
  // The user's chosen theme mode, for the settings UI (resolved value = theme).
  readonly themeChoice: ThemeChoice;
  readonly initialFolder: string | null;
  readonly fs: FsAdapter;
  readonly pickFolder: () => Promise<void>;
  readonly openRecent: (folder: string) => Promise<void>;
  // Abandon onboarding for the open folder: forget it (drop from recents) and
  // clear the window's board context.
  readonly cancelBoard: () => Promise<void>;
  // Drop a project from the sidebar list (does not touch the folder on disk).
  readonly removeRecent: (folder: string) => Promise<void>;
  readonly getRecents: () => Promise<ProjectEntry[]>;
  // Change the app-wide theme mode (persisted). The resolved value arrives via
  // `theme` / onThemeChange; the current mode is `themeChoice`.
  readonly setThemeChoice: (choice: ThemeChoice) => Promise<void>;
  readonly onBoardOpened: (listener: (folder: string) => void) => () => void;
  readonly onBoardClosed: (listener: () => void) => () => void;
  readonly onThemeChange: (listener: (theme: Theme) => void) => () => void;
}

export const IPC = {
  bootstrap: 'boardown:bootstrap',
  fs: 'boardown:fs',
  pickFolder: 'boardown:pick-folder',
  openRecent: 'boardown:open-recent',
  cancelBoard: 'boardown:cancel-board',
  removeRecent: 'boardown:remove-recent',
  getRecents: 'boardown:get-recents',
  setThemeChoice: 'boardown:set-theme-choice',
  boardOpened: 'boardown:board-opened',
  boardClosed: 'boardown:board-closed',
  themeChanged: 'boardown:theme-changed',
} as const;

declare global {
  interface Window {
    boardown: BoardownBridge;
  }
}
