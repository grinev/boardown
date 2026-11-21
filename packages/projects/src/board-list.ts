import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  CONFIG_FILENAME,
  DEFAULT_THEME,
  boardTheme,
  checkMinVersion,
  parseConfig,
  type Theme,
} from '@boardown/core';
import { inBatches, type RegistryEntry } from './registry-file.js';

// What the list page shows for one registered project. The name comes from the
// board's own config; a project whose board cannot be read keeps its row and
// carries the reason instead, so one bad entry never costs the others.
export interface BoardListRow {
  id: string;
  projectRoot: string;
  name: string;
  available: boolean;
  reason: string | null;
  theme: Theme;
}

export const describeEntry = async (entry: RegistryEntry): Promise<BoardListRow> => {
  const row = {
    id: entry.id,
    projectRoot: entry.projectRoot,
    name: path.basename(entry.projectRoot) || entry.projectRoot,
    theme: DEFAULT_THEME,
  };
  try {
    const folder = await fs.stat(entry.projectRoot);
    if (!folder.isDirectory()) {
      return { ...row, available: false, reason: 'not a folder' };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ...row,
      available: false,
      reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'folder not found' : 'could not be read',
    };
  }

  let text: string;
  try {
    text = await fs.readFile(path.join(entry.boardRoot, CONFIG_FILENAME), 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ...row,
      available: true,
      reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'no board yet' : 'could not be read',
    };
  }

  const gate = checkMinVersion(text);
  if (gate.kind === 'too-old') {
    return { ...row, available: true, reason: 'needs a newer boardown' };
  }
  const config = parseConfig(text);
  if (config.value === null) {
    return { ...row, available: true, reason: `${CONFIG_FILENAME} is invalid` };
  }
  return {
    ...row,
    available: true,
    name: config.value.projectName,
    reason: null,
    theme: boardTheme(config.value),
  };
};

export const describeEntries = (entries: readonly RegistryEntry[]): Promise<BoardListRow[]> =>
  inBatches(entries, describeEntry);
