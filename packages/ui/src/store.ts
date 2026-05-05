import type { BoardSnapshot, FsAdapter, ParseProblem } from '@boardown/core';
import { loadBoard } from '@boardown/core';
import { create } from 'zustand';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ActiveTab = { kind: 'backlog' } | { kind: 'release'; filename: string };

interface BoardState {
  status: BoardStatus;
  snapshot: BoardSnapshot | null;
  problems: ParseProblem[];
  errorMessage: string | null;
  activeTab: ActiveTab;
  load: (fs: FsAdapter) => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
}

const formatProblems = (problems: ParseProblem[]): string =>
  problems.map((p) => `${p.file}: ${p.message}`).join('\n');

export const useBoardStore = create<BoardState>((set) => ({
  status: 'idle',
  snapshot: null,
  problems: [],
  errorMessage: null,
  activeTab: { kind: 'backlog' },

  load: async (fs) => {
    set({ status: 'loading', errorMessage: null });
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
}));
