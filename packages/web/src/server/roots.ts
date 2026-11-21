import path from 'node:path';
import type { BoardRoots } from '@boardown/projects';
export { rootsFromProjectFolder, type BoardRoots } from '@boardown/projects';

export const BOARD_DIR_NAME = '.boardown';

// The two sources of a root do not name the same thing, so the mapping lives
// here once rather than being composed again by every caller: a registry entry
// is a project folder, which holds its board in `.boardown`, while `--data-dir`
// names that board folder directly, the way the dev shell has always meant it.
export const rootsFromBoardFolder = (folder: string): BoardRoots => {
  const boardRoot = path.resolve(folder);
  return { boardRoot, projectRoot: path.dirname(boardRoot) };
};
