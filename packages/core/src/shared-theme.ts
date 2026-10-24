import type { Theme } from './schemas.js';

// A theme a host applies over every board it serves, read from a configuration
// directory that is neither a board nor the project. Plain data: the host has
// already resolved the file, dropped what it does not know and validated the
// rest, so `tokens` holds only palette variables with values safe to apply.
export interface SharedTheme {
  id: string;
  /** What Settings shows; the host fills it, a stem when the file names none. */
  name: string;
  base: Theme;
  fontFamily?: string;
  tokens: Record<string, string>;
}

export interface SharedThemeState {
  /** The last valid theme, kept while `error` says a newer read failed. */
  theme: SharedTheme | null;
  error: string | null;
}

// What a shared theme puts on the page: its base over the board's own theme, and
// its tokens plus the font family as CSS variables. One rule for ui, which applies
// it, and for a host that stamps it into the page before ui runs.
export const displayedTheme = (shared: SharedTheme | null, board: Theme): Theme =>
  shared?.base ?? board;

export const sharedThemeOverrides = (shared: SharedTheme | null): Record<string, string> => {
  if (shared === null) return {};
  return shared.fontFamily === undefined
    ? { ...shared.tokens }
    : { ...shared.tokens, '--font-family': shared.fontFamily };
};

// Read-only, scoped to the host's configuration directory. Its own interface
// rather than a method on FsAdapter: it reads outside `.boardown/`, and no
// board write path may hold it.
export interface SharedThemeReader {
  read(): Promise<SharedThemeState>;
}
