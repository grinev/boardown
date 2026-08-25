import path from 'node:path';

export const BOARD_DIR_NAME = '.boardown';

export interface BoardRoots {
  /** Where the board files live. Every write resolves against this. */
  boardRoot: string;
  /** The folder around it. Repo file links read from here; nothing writes. */
  projectRoot: string;
}

// The two sources of a root do not name the same thing, so the mapping lives
// here once rather than being composed again by every caller: a registry entry
// is a project folder, which holds its board in `.boardown`, while `--data-dir`
// names that board folder directly, the way the dev shell has always meant it.
export const rootsFromProjectFolder = (folder: string): BoardRoots => {
  const projectRoot = path.resolve(folder);
  return { projectRoot, boardRoot: path.join(projectRoot, BOARD_DIR_NAME) };
};

export const rootsFromBoardFolder = (folder: string): BoardRoots => {
  const boardRoot = path.resolve(folder);
  return { boardRoot, projectRoot: path.dirname(boardRoot) };
};
