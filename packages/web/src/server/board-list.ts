import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILENAME, parseConfig } from '../../../core/src/config';
import type { RegistryEntry } from './registry.js';

// What the list page shows for one registered project. The name comes from the
// board's own config; a project whose board cannot be read keeps its row and
// carries the reason instead, so one bad entry never costs the others.
export interface BoardListRow {
  id: string;
  projectRoot: string;
  name: string | null;
  reason: string | null;
}

export const describeEntry = async (entry: RegistryEntry): Promise<BoardListRow> => {
  const row = { id: entry.id, projectRoot: entry.projectRoot };
  try {
    const folder = await fs.stat(entry.projectRoot);
    if (!folder.isDirectory()) {
      return { ...row, name: null, reason: 'could not be read' };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ...row,
      name: null,
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
      name: null,
      reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'no board yet' : 'could not be read',
    };
  }

  const config = parseConfig(text);
  if (config.value === null) {
    return { ...row, name: null, reason: `${CONFIG_FILENAME} is invalid` };
  }
  return { ...row, name: config.value.projectName, reason: null };
};

export const describeEntries = (entries: readonly RegistryEntry[]): Promise<BoardListRow[]> =>
  Promise.all(entries.map(describeEntry));
