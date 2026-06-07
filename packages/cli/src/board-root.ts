import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const BOARD_DIRNAME = '.boardown';

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

// Resolve the board's `.boardown/` directory. An explicit dataDir points
// straight at it (the web shell's `--data-dir` convention). Otherwise walk up
// from startDir looking for `.boardown/`, the way git locates `.git`.
export async function findBoardRoot(
  startDir: string,
  dataDir?: string,
): Promise<string | null> {
  if (dataDir !== undefined) {
    const abs = isAbsolute(dataDir) ? dataDir : resolve(startDir, dataDir);
    return (await pathExists(abs)) ? abs : null;
  }

  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, BOARD_DIRNAME);
    if (await pathExists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
