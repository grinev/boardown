import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ThemeChoice } from '../bridge';

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return CHOICES.includes(value as ThemeChoice);
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export async function loadThemeChoice(): Promise<ThemeChoice> {
  try {
    const parsed: unknown = JSON.parse(await fsp.readFile(storePath(), 'utf-8'));
    const choice = (parsed as { themeChoice?: unknown }).themeChoice;
    return isThemeChoice(choice) ? choice : 'system';
  } catch {
    return 'system';
  }
}

export async function saveThemeChoice(choice: ThemeChoice): Promise<void> {
  await fsp.mkdir(path.dirname(storePath()), { recursive: true });
  await fsp.writeFile(storePath(), `${JSON.stringify({ themeChoice: choice }, null, 2)}\n`, 'utf-8');
}
