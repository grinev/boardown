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

import { loadThemeChoice, saveThemeChoice } from './settings';

describe('settings — theme choice', () => {
  beforeEach(async () => {
    state.userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'boardown-settings-'));
  });

  afterEach(async () => {
    await fsp.rm(state.userData, { recursive: true, force: true });
  });

  it('defaults to system when there is no file', async () => {
    expect(await loadThemeChoice()).toBe('system');
  });

  it('round-trips a saved choice', async () => {
    await saveThemeChoice('dark');
    expect(await loadThemeChoice()).toBe('dark');
    await saveThemeChoice('light');
    expect(await loadThemeChoice()).toBe('light');
  });

  it('falls back to system on an unknown stored value', async () => {
    await fsp.writeFile(
      path.join(state.userData, 'settings.json'),
      JSON.stringify({ themeChoice: 'neon' }),
      'utf-8',
    );
    expect(await loadThemeChoice()).toBe('system');
  });

  it('falls back to system on malformed JSON', async () => {
    await fsp.writeFile(path.join(state.userData, 'settings.json'), '{ not json', 'utf-8');
    expect(await loadThemeChoice()).toBe('system');
  });
});
