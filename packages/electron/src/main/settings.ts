import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ThemeChoice } from '../bridge';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  themeChoice: ThemeChoice;
  windowBounds?: WindowBounds;
  windowMaximized?: boolean;
  // The project folder open when the app last closed, reopened on next launch.
  lastFolder?: string;
}

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return CHOICES.includes(value as ThemeChoice);
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function parseBounds(value: unknown): WindowBounds | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw: unknown = JSON.parse(await fsp.readFile(storePath(), 'utf-8'));
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const bounds = parseBounds(obj.windowBounds);
    return {
      themeChoice: isThemeChoice(obj.themeChoice) ? obj.themeChoice : 'system',
      ...(bounds ? { windowBounds: bounds } : {}),
      ...(obj.windowMaximized === true ? { windowMaximized: true } : {}),
      ...(typeof obj.lastFolder === 'string' ? { lastFolder: obj.lastFolder } : {}),
    };
  } catch {
    return { themeChoice: 'system' };
  }
}

let writeQueue: Promise<void> = Promise.resolve();

// Atomic write (temp file + rename) so a force-quit mid-write can't truncate
// settings.json — the rename either fully replaces the file or never happens, so
// the on-disk file is always complete. Writes are serialised through a queue so
// a theme change and a window-bounds save can't interleave into the temp file
// (and the single temp file is overwritten next save, never accumulating).
export function saveSettings(settings: Settings): Promise<void> {
  const run = async (): Promise<void> => {
    const target = storePath();
    const tmp = `${target}.tmp`;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
    await fsp.rename(tmp, target);
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}
