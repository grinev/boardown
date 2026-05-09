import type { BoardSnapshot, FsAdapter, ParseProblem, Theme } from '@boardown/core';
import { CONFIG_FILENAME, loadBoard, serializeConfig } from '@boardown/core';
import { create } from 'zustand';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ActiveTab = 'backlog' | 'board' | 'archive';

interface BoardState {
  status: BoardStatus;
  snapshot: BoardSnapshot | null;
  problems: ParseProblem[];
  errorMessage: string | null;
  activeTab: ActiveTab;
  theme: Theme;
  fs: FsAdapter | null;
  load: (fs: FsAdapter) => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  toggleTheme: () => Promise<void>;
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

  toggleTheme: async () => {
    const { snapshot, fs, theme: previous } = get();
    if (!snapshot || !fs) return;
    const next: Theme = previous === 'light' ? 'dark' : 'light';
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
}));
