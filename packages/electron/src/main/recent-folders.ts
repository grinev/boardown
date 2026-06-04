import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ProjectEntry, RecentEntry } from '../bridge';

const MAX_RECENTS = 10;

function storePath(): string {
  return path.join(app.getPath('userData'), 'recent-folders.json');
}

function isRecentEntry(value: unknown): value is RecentEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.folder === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.lastOpened === 'number'
  );
}

async function loadRaw(): Promise<RecentEntry[]> {
  try {
    const text = await fsp.readFile(storePath(), 'utf-8');
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry);
  } catch {
    return [];
  }
}

async function save(entries: RecentEntry[]): Promise<void> {
  await fsp.mkdir(path.dirname(storePath()), { recursive: true });
  await fsp.writeFile(storePath(), JSON.stringify(entries, null, 2), 'utf-8');
}

export async function addRecent(folder: string): Promise<void> {
  const entries = (await loadRaw()).filter((e) => e.folder !== folder);
  entries.unshift({ folder, name: path.basename(folder), lastOpened: Date.now() });
  await save(entries.slice(0, MAX_RECENTS));
}

// Forget a folder — used when onboarding is cancelled, so an abandoned open
// doesn't linger in the sidebar.
export async function removeRecent(folder: string): Promise<void> {
  await save((await loadRaw()).filter((entry) => entry.folder !== folder));
}

// Whether a folder is among the persisted recents — the allowlist check for
// openRecent. Uses the raw list (no stat sweep): existence pruning is a display
// concern, not a security one.
export async function isKnownRecent(folder: string): Promise<boolean> {
  return (await loadRaw()).some((entry) => entry.folder === folder);
}

// Prune entries whose folder no longer exists, and flag whether each still has
// a board (config.yaml) or needs onboarding. Stat in parallel so one stale entry
// on a slow volume can't stall the list. Two cheap stats per project, no board
// loading — the sidebar shows status without reading every project's tasks.
export async function listRecents(): Promise<ProjectEntry[]> {
  const entries = await loadRaw();
  const checked = await Promise.all(
    entries.map(async (entry): Promise<ProjectEntry | null> => {
      try {
        if (!(await fsp.stat(entry.folder)).isDirectory()) return null;
      } catch {
        return null;
      }
      let hasBoard = false;
      try {
        hasBoard = (await fsp.stat(path.join(entry.folder, '.boardown', 'config.yaml'))).isFile();
      } catch {
        hasBoard = false;
      }
      return { ...entry, hasBoard };
    }),
  );
  return checked.filter((entry): entry is ProjectEntry => entry !== null);
}
