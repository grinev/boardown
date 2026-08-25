import { readdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

// The filesystem half of auto-refresh, and the only file here that knows about
// fs.watch. It reports raw absolute paths and holds no policy: the debounce and
// the echo window live in board-events, next to the connections they belong to.
//
// Rather than rely on a recursive fs.watch — unreliable on Linux — the root and
// each subdirectory are watched explicitly: one level for the flat releases/ and
// epics/, the whole tree for docs/, which nests arbitrarily. This mirrors the
// Electron shell's topology; the two are copies of a shape, not of a rule.

const DOCS_DIR = 'docs';

export interface BoardWatcher {
  close: () => void;
}

export const watchBoard = (
  boardRoot: string,
  onChange: (absolutePath: string) => void,
): BoardWatcher => {
  // The whole tree is collected before a single watcher is installed. Reading a
  // directory is itself a change to it, so a walk interleaved with the watching
  // reports its own footsteps and the board refreshes the moment it is opened.
  const directories: string[] = [boardRoot];

  const collectTree = (dir: string): void => {
    directories.push(dir);
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) collectTree(path.join(dir, entry.name));
      }
    } catch {
      // Vanished between the readdir and this call — the parent still covers it.
    }
  };

  try {
    for (const entry of readdirSync(boardRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(boardRoot, entry.name);
      if (entry.name === DOCS_DIR) collectTree(dir);
      else directories.push(dir);
    }
  } catch {
    // Board root missing — nothing to watch until files appear.
  }

  const watchers: FSWatcher[] = [];
  for (const dir of directories) {
    try {
      watchers.push(
        watch(dir, (_event, filename) => {
          // A rename with no name is still a change in this directory, and the
          // policy layer only needs a path it can compare against its own
          // writes — the directory itself is the honest answer.
          onChange(filename === null ? dir : path.join(dir, filename));
        }),
      );
    } catch {
      // A directory that isn't there, or vanished between the walk and the
      // watch — skip it; the parent's watcher still sees it appear.
    }
  }

  return {
    close: () => {
      for (const w of watchers) w.close();
      watchers.length = 0;
    },
  };
};
