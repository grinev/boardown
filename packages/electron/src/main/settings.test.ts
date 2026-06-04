import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// settings.json lives under app.getPath('userData'); no Electron runtime in a
// unit test, so point it at a temp dir per test.
const { state } = vi.hoisted(() => ({ state: { userData: '' } }));
vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
}));

import { loadSettings, saveSettings } from './settings';

describe('settings', () => {
  beforeEach(async () => {
    state.userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'boardown-settings-'));
  });

  afterEach(async () => {
    await fsp.rm(state.userData, { recursive: true, force: true });
  });

  it('defaults to system theme and no bounds when there is no file', async () => {
    expect(await loadSettings()).toEqual({ themeChoice: 'system' });
  });

  it('round-trips theme choice and window bounds', async () => {
    const settings = {
      themeChoice: 'dark' as const,
      windowBounds: { x: 10, y: 20, width: 800, height: 600 },
      windowMaximized: true,
    };
    await saveSettings(settings);
    expect(await loadSettings()).toEqual(settings);
  });

  it('falls back to system on an unknown theme choice', async () => {
    await fsp.writeFile(
      path.join(state.userData, 'settings.json'),
      JSON.stringify({ themeChoice: 'neon' }),
      'utf-8',
    );
    expect((await loadSettings()).themeChoice).toBe('system');
  });

  it('drops invalid window bounds', async () => {
    await fsp.writeFile(
      path.join(state.userData, 'settings.json'),
      JSON.stringify({ themeChoice: 'light', windowBounds: { x: 0, y: 0, width: 0, height: -5 } }),
      'utf-8',
    );
    expect(await loadSettings()).toEqual({ themeChoice: 'light' });
  });

  it('falls back to defaults on malformed JSON', async () => {
    await fsp.writeFile(path.join(state.userData, 'settings.json'), '{ not json', 'utf-8');
    expect(await loadSettings()).toEqual({ themeChoice: 'system' });
  });

  it('leaves no temp file behind after an atomic save', async () => {
    await saveSettings({ themeChoice: 'dark' });
    expect(await fsp.readdir(state.userData)).toEqual(['settings.json']);
  });
});
